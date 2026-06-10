import { Injectable, Logger } from '@nestjs/common';
import { GameEvent, GameState, TeamId } from '@truco/game-core';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { levelFromXp } from '../users/users.service';
import { Room } from './room.types';

const XP_WIN = 50;
const XP_LOSS = 15;
const ELO_K = 32;

@Injectable()
export class GamePersistenceService {
  private readonly logger = new Logger(GamePersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Cria o registro da partida quando a sala inicia o jogo. */
  async createMatch(room: Room): Promise<string> {
    const match = await this.prisma.match.create({
      data: {
        mode: room.mode === '1v1' ? 'ONE_V_ONE' : 'TWO_V_TWO',
        ranked: room.ranked,
        players: {
          create: room.players.map((p) => ({
            userId: p.userId,
            seat: p.seat,
            team: p.seat % 2,
          })),
        },
      },
    });
    return match.id;
  }

  /** Persiste eventos do jogo (alimenta replay e auditoria anti-fraude). */
  async appendEvents(matchId: string, startSeq: number, events: GameEvent[]): Promise<number> {
    if (events.length === 0) return startSeq;
    try {
      await this.prisma.matchEvent.createMany({
        data: events.map((e, i) => ({
          matchId,
          seq: startSeq + i,
          type: e.type,
          payload: e as object,
        })),
      });
    } catch (err) {
      this.logger.error(`Falha ao persistir eventos da partida ${matchId}`, err as Error);
    }
    return startSeq + events.length;
  }

  /** Finaliza a partida: placar, XP e rating (Elo por média de equipe). */
  async finishMatch(
    matchId: string,
    state: GameState,
    options?: { abandonedBy?: string },
  ): Promise<void> {
    const winnerTeam = state.winnerTeam;
    if (winnerTeam === null) return;

    const players = await this.prisma.matchPlayer.findMany({
      where: { matchId },
      include: { user: { select: { id: true, xp: true, rating: true } } },
    });

    const teamRating = (team: TeamId) => {
      const members = players.filter((p) => p.team === team);
      return members.reduce((acc, p) => acc + p.user.rating, 0) / Math.max(1, members.length);
    };

    const match = await this.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    const expected0 = 1 / (1 + Math.pow(10, (teamRating(1) - teamRating(0)) / 400));

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: options?.abandonedBy ? 'ABANDONED' : 'FINISHED',
          winnerTeam,
          scoreTeam0: state.scores[0],
          scoreTeam1: state.scores[1],
          endedAt: new Date(),
        },
      });

      for (const player of players) {
        const won = player.team === winnerTeam;
        const xpEarned = won ? XP_WIN : XP_LOSS;
        const score = player.team === 0 ? (winnerTeam === 0 ? 1 : 0) : winnerTeam === 1 ? 1 : 0;
        const expected = player.team === 0 ? expected0 : 1 - expected0;
        const ratingDelta = match.ranked ? Math.round(ELO_K * (score - expected)) : 0;
        const newXp = player.user.xp + xpEarned;

        await tx.matchPlayer.update({
          where: { id: player.id },
          data: {
            xpEarned,
            ratingDelta,
            forfeited: options?.abandonedBy === player.userId,
          },
        });
        await tx.user.update({
          where: { id: player.userId },
          data: {
            xp: newXp,
            level: levelFromXp(newXp),
            rating: { increment: ratingDelta },
          },
        });
      }
    });
  }

  /**
   * Persiste o snapshot do estado a cada ação — partidas sobrevivem a
   * restart do servidor.
   */
  async saveSnapshot(room: Room): Promise<void> {
    if (!room.matchId || !room.state) return;
    try {
      await this.prisma.match.update({
        where: { id: room.matchId },
        data: {
          stateSnapshot: room.state as unknown as Prisma.InputJsonValue,
          roomId: room.id,
          roomCode: room.code,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao salvar snapshot da partida ${room.matchId}`, err as Error);
    }
  }

  /** Reconstrói salas de partidas IN_PROGRESS após restart do servidor. */
  async restoreRooms(): Promise<Room[]> {
    const matches = await this.prisma.match.findMany({
      where: { status: 'IN_PROGRESS', stateSnapshot: { not: Prisma.DbNull } },
      include: {
        players: {
          orderBy: { seat: 'asc' },
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    const rooms: Room[] = [];
    for (const match of matches) {
      const lastEvent = await this.prisma.matchEvent.aggregate({
        where: { matchId: match.id },
        _max: { seq: true },
      });
      rooms.push({
        id: match.roomId ?? randomUUID(),
        code: match.roomCode ?? randomUUID().slice(0, 6).toUpperCase(),
        mode: match.mode === 'ONE_V_ONE' ? '1v1' : '2v2',
        ranked: match.ranked,
        isPrivate: true,
        hostId: match.players[0]?.userId ?? '',
        players: match.players.map((p) => ({
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          socketId: null, // jogadores reconectam e retomam a sessão
          ready: true,
          seat: p.seat,
        })),
        state: match.stateSnapshot as unknown as GameState,
        matchId: match.id,
        seq: (lastEvent._max.seq ?? -1) + 1,
        series: [0, 0],
        rematchVotes: new Set(),
        lastActivity: Date.now(),
        createdAt: match.startedAt.getTime(),
      });
    }
    if (rooms.length > 0) {
      this.logger.log(`${rooms.length} partida(s) em andamento restaurada(s) do snapshot`);
    }
    return rooms;
  }

  /** Marca a partida como abandonada (sala expirada sem jogadores). */
  async abandonMatch(matchId: string): Promise<void> {
    await this.prisma.match
      .update({ where: { id: matchId }, data: { status: 'ABANDONED', endedAt: new Date() } })
      .catch(() => undefined);
  }

  async saveChatMessage(userId: string, matchId: string | null, content: string): Promise<string> {
    const msg = await this.prisma.chatMessage.create({
      data: { userId, matchId, content },
    });
    return msg.id;
  }

  async getUserRating(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { rating: true },
    });
    return user?.rating ?? 1000;
  }

  async getUserSummary(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true, rating: true },
    });
  }
}
