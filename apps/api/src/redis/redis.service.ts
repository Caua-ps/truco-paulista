import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Cliente Redis compartilhado: presença online, cache de ranking e
 * coordenação de matchmaking entre instâncias.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Sem fila offline: com Redis fora do ar, comandos falham na hora e os
      // chamadores (todos com catch) degradam graciosamente em vez de travar.
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(30_000, 1000 * 2 ** Math.min(times, 5)),
    });
    let warned = false;
    this.client.on('error', (err) => {
      if (!warned) {
        this.logger.warn(`Redis indisponível (${err.message}) — presença/cache desativados até reconectar`);
        warned = true;
      }
    });
    this.client.on('ready', () => {
      warned = false;
      this.logger.log('Redis conectado');
    });
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  /** Marca o usuário como online por `ttlSeconds` (renovado por heartbeat do socket). */
  async setPresence(userId: string, ttlSeconds = 90): Promise<void> {
    await this.client.set(`presence:${userId}`, '1', 'EX', ttlSeconds).catch(() => undefined);
  }

  async clearPresence(userId: string): Promise<void> {
    await this.client.del(`presence:${userId}`).catch(() => undefined);
  }

  async isOnline(userId: string): Promise<boolean> {
    const v = await this.client.exists(`presence:${userId}`).catch(() => 0);
    return v === 1;
  }
}
