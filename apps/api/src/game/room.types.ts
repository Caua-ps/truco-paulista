import { GameMode, GameState } from '@truco/game-core';

export interface RoomPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Socket atualmente conectado (null = caiu; aguardando reconexão). */
  socketId: string | null;
  ready: boolean;
  seat: number;
}

export interface Room {
  id: string;
  /** Código curto para convite (sala privada). */
  code: string;
  mode: GameMode;
  ranked: boolean;
  isPrivate: boolean;
  hostId: string;
  players: RoomPlayer[];
  /** Estado autoritativo do jogo — existe apenas no servidor. */
  state: GameState | null;
  /** Id da partida persistida (Match) quando o jogo começa. */
  matchId: string | null;
  /** Sequência de eventos persistidos (replay). */
  seq: number;
  /** Placar da série de revanches (partidas ganhas por equipe nesta sala). */
  series: [number, number];
  /** Jogadores que já pediram revanche após o fim da partida. */
  rematchVotes: Set<string>;
  /** Última ação relevante (para limpeza de salas abandonadas). */
  lastActivity: number;
  createdAt: number;
}

export const seatsFor = (mode: GameMode): number => (mode === '1v1' ? 2 : 4);

/** Resumo público da sala (sem estado do jogo). */
export function roomSummary(room: Room) {
  return {
    id: room.id,
    code: room.code,
    mode: room.mode,
    ranked: room.ranked,
    isPrivate: room.isPrivate,
    hostId: room.hostId,
    started: room.state !== null,
    seriesScore: room.series,
    rematchVotes: [...room.rematchVotes],
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      seat: p.seat,
      team: p.seat % 2,
      ready: p.ready,
      connected: p.socketId !== null,
    })),
  };
}
