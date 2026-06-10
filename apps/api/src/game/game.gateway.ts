import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  applyAction,
  cardStrength,
  createGame,
  GameAction,
  GameEvent,
  GameMode,
  TeamId,
  TrucoError,
  viewFor,
} from '@truco/game-core';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { GamePersistenceService } from './game-persistence.service';
import { MatchmakingService } from './matchmaking.service';
import { RoomManagerService } from './room-manager.service';
import { Room, roomSummary, seatsFor } from './room.types';

interface SocketUser {
  id: string;
  username: string;
}

/** Tempo para reconectar antes de perder por W.O. */
const FORFEIT_TIMEOUT_MS = 60_000;
/** Tempo máximo por decisão (jogada, resposta de truco, mão de onze). */
const TURN_TIMEOUT_MS = 30_000;
/** Salas sem ninguém conectado além deste tempo são encerradas. */
const IDLE_ROOM_MS = 30 * 60_000;
/** Rate limit do chat: janela e máximo de mensagens. */
const CHAT_WINDOW_MS = 5_000;
const CHAT_MAX_PER_WINDOW = 5;

const QUICK_EMOJIS = ['👍', '😂', '😮', '😡', '🃏', '🔥', '🤝', '😎'];

/**
 * Gateway multiplayer em tempo real.
 *
 * Princípios anti-trapaça:
 *  - O estado completo do jogo vive somente no servidor.
 *  - Cada cliente recebe apenas a sua visão (viewFor) — nunca as cartas alheias.
 *  - O assento usado nas ações vem do servidor (userId autenticado), nunca do payload.
 *  - Toda regra é validada pelo motor; ação inválida vira erro só para o autor.
 */
@WebSocketGateway({
  namespace: '/game',
  cors: { origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000', credentials: true },
})
export class GameGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);
  /** userId → dados do usuário autenticado do socket. */
  private readonly socketUsers = new Map<string, SocketUser>();
  private readonly forfeitTimers = new Map<string, NodeJS.Timeout>();
  private readonly chatTimestamps = new Map<string, number[]>();
  /** roomId → timer da decisão corrente. */
  private readonly turnTimers = new Map<string, { timer: NodeJS.Timeout; seat: number; deadline: number }>();
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomManagerService,
    private readonly matchmaking: MatchmakingService,
    private readonly persistence: GamePersistenceService,
    private readonly redis: RedisService,
  ) {
    this.matchmaking.setMatchFoundHandler((mode, ranked, userIds) =>
      this.onMatchFound(mode, ranked, userIds),
    );
  }

  /** Restaura partidas em andamento do snapshot (resiliência a restart). */
  async onModuleInit() {
    try {
      const restored = await this.persistence.restoreRooms();
      for (const room of restored) this.rooms.registerRestored(room);
    } catch (err) {
      this.logger.error('Falha ao restaurar partidas do snapshot', err as Error);
    }
    this.sweepInterval = setInterval(() => void this.sweepIdleRooms(), 5 * 60_000);
  }

  onModuleDestroy() {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    for (const { timer } of this.turnTimers.values()) clearTimeout(timer);
    for (const timer of this.forfeitTimers.values()) clearTimeout(timer);
  }

  // ---------------------------------------------------------------------------
  // Conexão / presença / reconexão
  // ---------------------------------------------------------------------------

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token ?? '');
      const user: SocketUser = { id: payload.sub, username: payload.username };
      this.socketUsers.set(socket.id, user);
      socket.data.user = user;
      await this.redis.setPresence(user.id);

      // Reconexão: se o usuário tem sala ativa, retoma a sessão.
      const room = this.rooms.setSocket(user.id, socket.id);
      if (room) {
        socket.join(room.id);
        this.cancelForfeit(user.id);
        room.lastActivity = Date.now();
        socket.emit('room:update', roomSummary(room));
        if (room.state) {
          const seat = room.players.find((p) => p.userId === user.id)?.seat ?? 0;
          socket.emit('game:state', viewFor(room.state, seat));
          this.ensureTurnTimer(room, socket);
        }
        this.server.to(room.id).emit('room:update', roomSummary(room));
      }
    } catch {
      socket.emit('error', { message: 'Autenticação inválida' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const user = this.socketUsers.get(socket.id);
    this.socketUsers.delete(socket.id);
    if (!user) return;

    await this.redis.clearPresence(user.id);
    this.matchmaking.dequeue(user.id);

    const room = this.rooms.findByUser(user.id);
    if (!room) return;
    this.rooms.setSocket(user.id, null);
    this.server.to(room.id).emit('room:update', roomSummary(room));

    if (room.state && room.state.winnerTeam === null) {
      // Partida em andamento: espera reconexão; sem volta = W.O.
      this.scheduleForfeit(room, user.id);
    } else if (!room.state) {
      // Lobby: sai da sala imediatamente.
      const remaining = this.rooms.leaveCurrent(user.id);
      if (remaining) this.server.to(remaining.id).emit('room:update', roomSummary(remaining));
    }
  }

  // ---------------------------------------------------------------------------
  // Salas
  // ---------------------------------------------------------------------------

  @SubscribeMessage('room:create')
  async createRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { mode?: GameMode; ranked?: boolean; isPrivate?: boolean },
  ) {
    const user = this.requireUser(socket);
    const profile = await this.persistence.getUserSummary(user.id);
    const mode: GameMode = body?.mode === '2v2' ? '2v2' : '1v1';
    const room = this.rooms.create(
      {
        userId: user.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        socketId: socket.id,
      },
      { mode, ranked: false, isPrivate: body?.isPrivate ?? true },
    );
    socket.join(room.id);
    socket.emit('room:update', roomSummary(room));
    return { ok: true, code: room.code };
  }

  @SubscribeMessage('room:join')
  async joinRoom(@ConnectedSocket() socket: Socket, @MessageBody() body: { code?: string }) {
    const user = this.requireUser(socket);
    if (!body?.code) return { ok: false, error: 'Código obrigatório' };
    const profile = await this.persistence.getUserSummary(user.id);
    const result = this.rooms.join(body.code, {
      userId: user.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      socketId: socket.id,
    });
    if ('error' in result) return { ok: false, error: result.error };
    socket.join(result.id);
    this.cancelForfeit(user.id);
    this.server.to(result.id).emit('room:update', roomSummary(result));
    // Re-entrada em partida em andamento: reenvia a visão atual do jogo.
    if (result.state) {
      const seat = result.players.find((p) => p.userId === user.id)?.seat ?? 0;
      socket.emit('game:state', viewFor(result.state, seat));
    }
    return { ok: true, code: result.code };
  }

  @SubscribeMessage('room:leave')
  leaveRoom(@ConnectedSocket() socket: Socket) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    if (!room) return { ok: true };

    if (room.state && room.state.winnerTeam === null) {
      // Abandono no meio do jogo: derrota imediata por W.O.
      void this.forfeit(room, user.id);
    }
    socket.leave(room.id);
    const remaining = this.rooms.leaveCurrent(user.id);
    if (remaining) {
      this.server.to(remaining.id).emit('room:update', roomSummary(remaining));
    } else {
      // Sala foi destruída (último jogador saiu).
      this.clearTurnTimer(room.id);
    }
    return { ok: true };
  }

  @SubscribeMessage('room:ready')
  async setReady(@ConnectedSocket() socket: Socket, @MessageBody() body: { ready?: boolean }) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    if (!room || room.state) return { ok: false, error: 'Sala inválida' };

    const player = room.players.find((p) => p.userId === user.id);
    if (player) player.ready = body?.ready ?? true;
    this.server.to(room.id).emit('room:update', roomSummary(room));

    const full = room.players.length === seatsFor(room.mode);
    if (full && room.players.every((p) => p.ready)) {
      await this.startGame(room);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Matchmaking
  // ---------------------------------------------------------------------------

  @SubscribeMessage('queue:join')
  async joinQueue(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { mode?: GameMode; ranked?: boolean },
  ) {
    const user = this.requireUser(socket);
    if (this.rooms.findByUser(user.id)) return { ok: false, error: 'Saia da sala atual primeiro' };
    const mode: GameMode = body?.mode === '2v2' ? '2v2' : '1v1';
    const rating = await this.persistence.getUserRating(user.id);
    this.matchmaking.enqueue(mode, body?.ranked ?? false, user.id, rating);
    return { ok: true };
  }

  @SubscribeMessage('queue:leave')
  leaveQueue(@ConnectedSocket() socket: Socket) {
    const user = this.requireUser(socket);
    this.matchmaking.dequeue(user.id);
    return { ok: true };
  }

  private async onMatchFound(mode: GameMode, ranked: boolean, userIds: string[]) {
    // Monta a sala com os jogadores pareados e inicia imediatamente.
    const sockets = userIds.map((id) => this.findSocketByUser(id));
    if (sockets.some((s) => !s)) {
      // Alguém caiu entre o pareamento e a criação: devolve os demais à fila.
      userIds.forEach(async (id, i) => {
        const s = sockets[i];
        if (s) {
          const rating = await this.persistence.getUserRating(id);
          this.matchmaking.enqueue(mode, ranked, id, rating);
        }
      });
      return;
    }

    const profiles = await Promise.all(userIds.map((id) => this.persistence.getUserSummary(id)));
    const first = profiles[0]!;
    const room = this.rooms.create(
      {
        userId: first.id,
        username: first.username,
        displayName: first.displayName,
        avatarUrl: first.avatarUrl,
        socketId: sockets[0]!.id,
      },
      { mode, ranked, isPrivate: false },
    );
    for (let i = 1; i < profiles.length; i++) {
      const p = profiles[i]!;
      this.rooms.join(room.code, {
        userId: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        socketId: sockets[i]!.id,
      });
    }
    for (const s of sockets) {
      s!.join(room.id);
      s!.emit('queue:matched', { code: room.code });
    }
    await this.startGame(room);
  }

  // ---------------------------------------------------------------------------
  // Jogo
  // ---------------------------------------------------------------------------

  private async startGame(room: Room) {
    const { state, events } = createGame({
      mode: room.mode,
      playerIds: room.players
        .slice()
        .sort((a, b) => a.seat - b.seat)
        .map((p) => p.userId),
    });
    room.state = state;
    room.matchId = await this.persistence.createMatch(room);
    room.seq = await this.persistence.appendEvents(room.matchId, 0, events);
    room.lastActivity = Date.now();

    this.server.to(room.id).emit('room:update', roomSummary(room));
    this.server.to(room.id).emit('game:start', { matchId: room.matchId });
    this.broadcastEvents(room, events);
    this.broadcastState(room);
    await this.persistence.saveSnapshot(room);
    this.scheduleTurnTimer(room);
  }

  @SubscribeMessage('game:action')
  async gameAction(@ConnectedSocket() socket: Socket, @MessageBody() body: { action?: GameAction }) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    if (!room?.state || !body?.action) return { ok: false, error: 'Sem partida ativa' };

    const player = room.players.find((p) => p.userId === user.id);
    if (!player) return { ok: false, error: 'Você não está nesta partida' };

    // Nunca confie no assento vindo do cliente.
    const action = { ...body.action, seat: player.seat } as GameAction;

    try {
      const events = applyAction(room.state, action);
      await this.afterAction(room, events);
      return { ok: true };
    } catch (err) {
      if (err instanceof TrucoError) {
        return { ok: false, error: err.message, code: err.code };
      }
      this.logger.error('Erro inesperado em game:action', err as Error);
      return { ok: false, error: 'Erro interno' };
    }
  }

  /** Pós-processamento comum a ações de jogador e auto-jogadas do timer. */
  private async afterAction(room: Room, events: GameEvent[]): Promise<void> {
    room.lastActivity = Date.now();
    if (room.matchId) {
      room.seq = await this.persistence.appendEvents(room.matchId, room.seq, events);
    }
    this.broadcastEvents(room, events);
    this.broadcastState(room);

    if (room.state?.winnerTeam !== null && room.state && room.matchId) {
      // Fim de jogo: encerra partida, atualiza série e libera revanche.
      this.clearTurnTimer(room.id);
      await this.persistence.finishMatch(room.matchId, room.state);
      room.series[room.state.winnerTeam]++;
      room.rematchVotes.clear();
      this.server.to(room.id).emit('room:update', roomSummary(room));
      return;
    }

    await this.persistence.saveSnapshot(room);
    this.scheduleTurnTimer(room);
  }

  // ---------------------------------------------------------------------------
  // Revanche
  // ---------------------------------------------------------------------------

  @SubscribeMessage('room:rematch')
  async rematch(@ConnectedSocket() socket: Socket) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    if (!room?.state || room.state.winnerTeam === null) {
      return { ok: false, error: 'A partida ainda não terminou' };
    }
    room.rematchVotes.add(user.id);
    this.server.to(room.id).emit('room:update', roomSummary(room));

    const everyoneIn = room.players.every((p) => room.rematchVotes.has(p.userId));
    if (everyoneIn) {
      room.rematchVotes.clear();
      room.state = null;
      room.matchId = null;
      room.seq = 0;
      await this.startGame(room);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Timer de turno: 30s por decisão; estourou, o servidor age pelo jogador
  // ---------------------------------------------------------------------------

  /** Assento que deve agir no estado corrente (jogada, truco ou mão de onze). */
  private actorSeat(room: Room): number | null {
    const hand = room.state?.hand;
    if (!hand || room.state?.winnerTeam !== null) return null;
    if (hand.phase === 'playing') return hand.currentTurnSeat;
    if (hand.phase === 'trucoPending' && hand.lastRaiserTeam !== null) {
      const team = (1 - hand.lastRaiserTeam) as TeamId;
      const member =
        room.players.find((p) => p.seat % 2 === team && p.socketId) ??
        room.players.find((p) => p.seat % 2 === team);
      return member?.seat ?? null;
    }
    if (hand.phase === 'maoDeOnzeDecision' && hand.maoDeOnzeTeam !== null) {
      const team = hand.maoDeOnzeTeam;
      const member =
        room.players.find((p) => p.seat % 2 === team && p.socketId) ??
        room.players.find((p) => p.seat % 2 === team);
      return member?.seat ?? null;
    }
    return null;
  }

  private scheduleTurnTimer(room: Room): void {
    this.clearTurnTimer(room.id);
    const seat = this.actorSeat(room);
    if (seat === null) return;
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    const timer = setTimeout(() => void this.autoAct(room.id), TURN_TIMEOUT_MS);
    this.turnTimers.set(room.id, { timer, seat, deadline });
    this.server.to(room.id).emit('turn:deadline', { seat, deadline });
  }

  /** Reconexão: reaproveita o timer corrente ou agenda um novo. */
  private ensureTurnTimer(room: Room, socket: Socket): void {
    const existing = this.turnTimers.get(room.id);
    if (existing) {
      socket.emit('turn:deadline', { seat: existing.seat, deadline: existing.deadline });
    } else {
      this.scheduleTurnTimer(room);
    }
  }

  private clearTurnTimer(roomId: string): void {
    const entry = this.turnTimers.get(roomId);
    if (entry) {
      clearTimeout(entry.timer);
      this.turnTimers.delete(roomId);
    }
  }

  /** Tempo esgotado: joga a carta mais fraca / corre do truco / corre da mão de onze. */
  private async autoAct(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    this.turnTimers.delete(roomId);
    const hand = room?.state?.hand;
    if (!room || !room.state || !hand || room.state.winnerTeam !== null) return;

    let action: GameAction | null = null;
    if (hand.phase === 'playing') {
      const seat = hand.currentTurnSeat;
      const cards = hand.hands[seat] ?? [];
      if (cards.length === 0) return;
      let weakest = 0;
      let weakestStrength = Infinity;
      cards.forEach((card, i) => {
        const s = cardStrength(card, hand.vira);
        if (s < weakestStrength) {
          weakestStrength = s;
          weakest = i;
        }
      });
      action = { type: 'PLAY_CARD', seat, cardIndex: weakest };
    } else if (hand.phase === 'trucoPending') {
      const seat = this.actorSeat(room);
      if (seat !== null) action = { type: 'RESPOND_TRUCO', seat, response: 'run' };
    } else if (hand.phase === 'maoDeOnzeDecision') {
      const seat = this.actorSeat(room);
      if (seat !== null) action = { type: 'MAO_DE_ONZE_DECISION', seat, play: false };
    }
    if (!action) return;

    try {
      const events = applyAction(room.state, action);
      this.server.to(room.id).emit('turn:timeout', { seat: action.seat });
      await this.afterAction(room, events);
    } catch (err) {
      this.logger.error(`Auto-jogada falhou na sala ${roomId}`, err as Error);
    }
  }

  /** Encerra salas sem nenhum jogador conectado há mais de IDLE_ROOM_MS. */
  private async sweepIdleRooms(): Promise<void> {
    for (const room of this.rooms.all()) {
      const allDisconnected = room.players.every((p) => !p.socketId);
      if (!allDisconnected || Date.now() - room.lastActivity < IDLE_ROOM_MS) continue;
      this.clearTurnTimer(room.id);
      if (room.matchId && room.state && room.state.winnerTeam === null) {
        await this.persistence.abandonMatch(room.matchId);
      }
      this.rooms.destroy(room.id);
      this.logger.log(`Sala ociosa encerrada: ${room.code}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Chat e emojis
  // ---------------------------------------------------------------------------

  @SubscribeMessage('chat:send')
  async chatSend(@ConnectedSocket() socket: Socket, @MessageBody() body: { text?: string }) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    const text = body?.text?.trim();
    if (!room || !text) return { ok: false };
    if (text.length > 200) return { ok: false, error: 'Mensagem muito longa' };
    if (!this.allowChat(user.id)) return { ok: false, error: 'Calma! Aguarde para enviar de novo.' };

    const id = await this.persistence.saveChatMessage(user.id, room.matchId, text);
    this.server.to(room.id).emit('chat:message', {
      id,
      userId: user.id,
      username: user.username,
      text,
      at: Date.now(),
    });
    return { ok: true };
  }

  @SubscribeMessage('emoji:send')
  emojiSend(@ConnectedSocket() socket: Socket, @MessageBody() body: { emoji?: string }) {
    const user = this.requireUser(socket);
    const room = this.rooms.findByUser(user.id);
    if (!room || !body?.emoji || !QUICK_EMOJIS.includes(body.emoji)) return { ok: false };
    if (!this.allowChat(user.id)) return { ok: false };
    this.server.to(room.id).emit('emoji:received', { userId: user.id, emoji: body.emoji });
    return { ok: true };
  }

  /** Heartbeat de presença (cliente envia a cada 30s). */
  @SubscribeMessage('presence:ping')
  async presencePing(@ConnectedSocket() socket: Socket) {
    const user = this.requireUser(socket);
    await this.redis.setPresence(user.id);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /** Envia a visão individual do estado para cada jogador conectado. */
  private broadcastState(room: Room) {
    if (!room.state) return;
    for (const player of room.players) {
      if (!player.socketId) continue;
      this.server.to(player.socketId).emit('game:state', viewFor(room.state, player.seat));
    }
  }

  /** Eventos do motor já são seguros para broadcast (cartas cobertas saem null). */
  private broadcastEvents(room: Room, events: GameEvent[]) {
    this.server.to(room.id).emit('game:events', events);
  }

  private scheduleForfeit(room: Room, userId: string) {
    this.cancelForfeit(userId);
    const timer = setTimeout(() => void this.forfeit(room, userId), FORFEIT_TIMEOUT_MS);
    this.forfeitTimers.set(userId, timer);
    this.server.to(room.id).emit('player:disconnected', {
      userId,
      reconnectDeadline: Date.now() + FORFEIT_TIMEOUT_MS,
    });
  }

  private cancelForfeit(userId: string) {
    const timer = this.forfeitTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.forfeitTimers.delete(userId);
    }
  }

  /** Derrota por W.O.: o time do desertor perde com o placar atual. */
  private async forfeit(room: Room, userId: string) {
    this.cancelForfeit(userId);
    this.clearTurnTimer(room.id);
    const current = this.rooms.get(room.id);
    if (!current?.state || current.state.winnerTeam !== null) return;

    const player = current.players.find((p) => p.userId === userId);
    if (!player) return;
    const winnerTeam = ((player.seat % 2) === 0 ? 1 : 0) as 0 | 1;

    current.state.winnerTeam = winnerTeam;
    current.state.scores[winnerTeam] = current.state.config.targetScore;
    current.state.hand = null;

    if (current.matchId) {
      await this.persistence.finishMatch(current.matchId, current.state, { abandonedBy: userId });
    }
    this.server.to(current.id).emit('game:events', [
      { type: 'GAME_ENDED', winnerTeam, scores: [...current.state.scores] } satisfies GameEvent,
    ]);
    this.broadcastState(current);
  }

  /** Rate limit de chat/emoji por usuário: CHAT_MAX_PER_WINDOW por CHAT_WINDOW_MS. */
  private allowChat(userId: string): boolean {
    const now = Date.now();
    const recent = (this.chatTimestamps.get(userId) ?? []).filter(
      (t) => now - t < CHAT_WINDOW_MS,
    );
    if (recent.length >= CHAT_MAX_PER_WINDOW) {
      this.chatTimestamps.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.chatTimestamps.set(userId, recent);
    return true;
  }

  private requireUser(socket: Socket): SocketUser {
    const user = this.socketUsers.get(socket.id);
    if (!user) throw new Error('Socket não autenticado');
    return user;
  }

  private findSocketByUser(userId: string): Socket | null {
    for (const [socketId, user] of this.socketUsers) {
      if (user.id === userId) {
        const sockets = (this.server.sockets as unknown as Map<string, Socket>);
        const s = sockets?.get?.(socketId);
        if (s) return s;
      }
    }
    return null;
  }
}
