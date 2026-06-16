import { Controller, Get, Param } from '@nestjs/common';
import { RoomManagerService } from './room-manager.service';
import { seatsFor } from './room.types';

/**
 * Endpoints HTTP do jogo. Por enquanto só a prévia pública de uma sala,
 * usada pela página de convite (`/convite/CODIGO`) para montar o card de
 * preview do link sem exigir login.
 */
@Controller('rooms')
export class GameController {
  constructor(private readonly rooms: RoomManagerService) {}

  /** Prévia pública de uma sala por código — sem dados sensíveis nem cartas. */
  @Get(':code/preview')
  preview(@Param('code') code: string) {
    const room = this.rooms.all().find((r) => r.code === code.toUpperCase());
    if (!room) {
      return { found: false };
    }
    const host = room.players.find((p) => p.userId === room.hostId) ?? room.players[0];
    const max = seatsFor(room.mode);
    return {
      found: true,
      code: room.code,
      mode: room.mode,
      ranked: room.ranked,
      started: room.state !== null,
      players: room.players.length,
      max,
      full: room.players.length >= max,
      host: host
        ? { displayName: host.displayName, username: host.username, avatarUrl: host.avatarUrl }
        : null,
    };
  }
}
