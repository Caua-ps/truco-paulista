import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GameMode } from '@truco/game-core';

export interface QueueEntry {
  userId: string;
  rating: number;
  enqueuedAt: number;
}

export type QueueKey = `${GameMode}:${'ranked' | 'casual'}`;

export type MatchFoundHandler = (
  mode: GameMode,
  ranked: boolean,
  userIds: string[],
) => Promise<void> | void;

/**
 * Matchmaking automático.
 *
 * Casual: FIFO simples. Ranqueada: pareia por proximidade de rating, com
 * janela que se alarga ~100 pontos a cada 5s de espera (ninguém espera para sempre).
 *
 * MVP em memória; em multi-instância, mova as filas para Redis (sorted set por
 * rating) com um worker único de pareamento — ver docs/SCALABILITY.md.
 */
@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly queues = new Map<QueueKey, QueueEntry[]>();
  private timer: NodeJS.Timeout | null = null;
  private onMatchFound: MatchFoundHandler | null = null;

  onModuleInit() {
    this.timer = setInterval(() => this.tick(), 2000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  setMatchFoundHandler(handler: MatchFoundHandler) {
    this.onMatchFound = handler;
  }

  enqueue(mode: GameMode, ranked: boolean, userId: string, rating: number): void {
    this.dequeue(userId);
    const key: QueueKey = `${mode}:${ranked ? 'ranked' : 'casual'}`;
    const queue = this.queues.get(key) ?? [];
    queue.push({ userId, rating, enqueuedAt: Date.now() });
    this.queues.set(key, queue);
  }

  dequeue(userId: string): void {
    for (const [key, queue] of this.queues) {
      this.queues.set(
        key,
        queue.filter((e) => e.userId !== userId),
      );
    }
  }

  private tick(): void {
    for (const [key, queue] of this.queues) {
      const [mode, kind] = key.split(':') as [GameMode, 'ranked' | 'casual'];
      const needed = mode === '1v1' ? 2 : 4;
      if (queue.length < needed) continue;

      const ranked = kind === 'ranked';
      const matched = ranked ? this.pickByRating(queue, needed) : queue.slice(0, needed);
      if (!matched) continue;

      const ids = new Set(matched.map((m) => m.userId));
      this.queues.set(
        key,
        queue.filter((e) => !ids.has(e.userId)),
      );

      this.logger.log(`Partida formada (${key}): ${[...ids].join(', ')}`);
      void this.onMatchFound?.(mode, ranked, matched.map((m) => m.userId));
    }
  }

  /** Janela de rating: 100 + 100 por cada 5s de espera do jogador mais antigo. */
  private pickByRating(queue: QueueEntry[], needed: number): QueueEntry[] | null {
    const sorted = [...queue].sort((a, b) => a.rating - b.rating);
    for (let i = 0; i + needed <= sorted.length; i++) {
      const group = sorted.slice(i, i + needed);
      const spread = group[group.length - 1]!.rating - group[0]!.rating;
      const oldestWait = Date.now() - Math.min(...group.map((g) => g.enqueuedAt));
      const window = 100 + Math.floor(oldestWait / 5000) * 100;
      if (spread <= window) return group;
    }
    return null;
  }
}
