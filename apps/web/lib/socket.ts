'use client';

import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-store';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

/**
 * Socket singleton do jogo. Reconexão automática é nativa do Socket.IO;
 * o servidor retoma a sessão de sala/partida ao reconectar.
 */
export function getGameSocket(): Socket {
  if (socket?.connected || socket?.active) return socket;

  socket = io(`${WS_URL}/game`, {
    auth: (cb) => cb({ token: useAuth.getState().accessToken }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  // Heartbeat de presença.
  const heartbeat = setInterval(() => {
    if (socket?.connected) socket.emit('presence:ping');
  }, 30_000);
  socket.on('disconnect', () => undefined);
  socket.io.on('close', () => clearInterval(heartbeat));

  return socket;
}

export function disconnectGameSocket(): void {
  socket?.disconnect();
  socket = null;
}
