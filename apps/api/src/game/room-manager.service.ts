import { Injectable } from '@nestjs/common';
import { GameMode } from '@truco/game-core';
import { randomBytes, randomUUID } from 'crypto';
import { Room, RoomPlayer, seatsFor } from './room.types';

/**
 * Registro de salas em memória.
 *
 * MVP: uma instância de servidor de jogo. Para escalar horizontalmente,
 * fixe cada sala a uma instância (sticky por roomId via Redis) e use o
 * adapter Redis do Socket.IO para broadcast entre nós — ver docs/SCALABILITY.md.
 */
@Injectable()
export class RoomManagerService {
  private readonly rooms = new Map<string, Room>();
  private readonly byCode = new Map<string, string>();
  private readonly byUser = new Map<string, string>();

  create(host: Omit<RoomPlayer, 'seat' | 'ready' | 'socketId'> & { socketId: string }, opts: {
    mode: GameMode;
    ranked: boolean;
    isPrivate: boolean;
  }): Room {
    this.leaveCurrent(host.userId);
    const code = this.uniqueCode();
    const room: Room = {
      id: randomUUID(),
      code,
      mode: opts.mode,
      ranked: opts.ranked,
      isPrivate: opts.isPrivate,
      hostId: host.userId,
      players: [{ ...host, seat: 0, ready: false }],
      state: null,
      matchId: null,
      seq: 0,
      series: [0, 0],
      rematchVotes: new Set(),
      lastActivity: Date.now(),
      createdAt: Date.now(),
    };
    this.rooms.set(room.id, room);
    this.byCode.set(code, room.id);
    this.byUser.set(host.userId, room.id);
    return room;
  }

  /** Reinsere uma sala restaurada de snapshot (após restart do servidor). */
  registerRestored(room: Room): void {
    if (this.byCode.has(room.code)) {
      room.code = this.uniqueCode();
    }
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room.id);
    for (const p of room.players) {
      this.byUser.set(p.userId, room.id);
    }
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  join(code: string, player: Omit<RoomPlayer, 'seat' | 'ready' | 'socketId'> & { socketId: string }): Room | { error: string } {
    const roomId = this.byCode.get(code.toUpperCase());
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) return { error: 'Sala não encontrada' };

    // Re-entrada (navegação/refresh): quem já está na sala apenas reassocia o
    // socket — deve funcionar mesmo com sala cheia ou partida em andamento.
    const existing = room.players.find((p) => p.userId === player.userId);
    if (existing) {
      existing.socketId = player.socketId;
      this.byUser.set(player.userId, room.id);
      return room;
    }

    if (room.state) return { error: 'A partida já começou' };
    if (room.players.length >= seatsFor(room.mode)) return { error: 'Sala cheia' };

    this.leaveCurrent(player.userId);
    const takenSeats = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (takenSeats.has(seat)) seat++;
    room.players.push({ ...player, seat, ready: false });
    this.byUser.set(player.userId, room.id);
    return room;
  }

  /** Remove o jogador da sala atual (se houver). Retorna a sala abandonada. */
  leaveCurrent(userId: string): Room | null {
    const roomId = this.byUser.get(userId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    this.byUser.delete(userId);
    if (!room) return null;

    room.players = room.players.filter((p) => p.userId !== userId);
    if (room.players.length === 0) {
      this.destroy(room.id);
      return null;
    }
    if (room.hostId === userId) {
      room.hostId = room.players[0]!.userId;
    }
    return room;
  }

  destroy(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const p of room.players) {
      if (this.byUser.get(p.userId) === roomId) this.byUser.delete(p.userId);
    }
    this.byCode.delete(room.code);
    this.rooms.delete(roomId);
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  findByUser(userId: string): Room | undefined {
    const roomId = this.byUser.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /** Vincula novos sockets (reconexão) e desconexões. */
  setSocket(userId: string, socketId: string | null): Room | undefined {
    const room = this.findByUser(userId);
    const player = room?.players.find((p) => p.userId === userId);
    if (player) player.socketId = socketId;
    return room;
  }

  private uniqueCode(): string {
    // Código legível de 6 caracteres, sem ambiguidade (0/O, 1/I).
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      let code = '';
      const bytes = randomBytes(6);
      for (let i = 0; i < 6; i++) code += alphabet[bytes[i]! % alphabet.length];
      if (!this.byCode.has(code)) return code;
    }
  }
}
