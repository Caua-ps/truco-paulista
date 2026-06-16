import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Endpoints de saúde para os health checks da plataforma de deploy
 * (Fly.io/Railway/Render) e balanceadores. Públicos por design.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: o processo está de pé e respondendo. */
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness: dependências (banco e Redis) estão acessíveis. */
  @Get('ready')
  async ready() {
    const [db, cache] = await Promise.all([this.check(() => this.pingDb()), this.check(() => this.pingRedis())]);
    const ok = db && cache;
    return { status: ok ? 'ok' : 'degraded', db, redis: cache };
  }

  private async pingDb(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async pingRedis(): Promise<void> {
    await this.redis.client.ping();
  }

  private async check(fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  }
}
