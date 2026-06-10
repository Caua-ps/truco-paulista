import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_SECONDS = 60;

export type RankingPeriod = 'global' | 'weekly' | 'monthly';

@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async leaderboard(period: RankingPeriod, limit = 50) {
    const cacheKey = `ranking:${period}:${limit}`;
    const cached = await this.redis.client.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const result =
      period === 'global' ? await this.globalLeaderboard(limit) : await this.periodLeaderboard(period, limit);

    await this.redis.client
      .set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined);
    return result;
  }

  private async globalLeaderboard(limit: number) {
    const users = await this.prisma.user.findMany({
      orderBy: { rating: 'desc' },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        level: true,
        rating: true,
      },
    });
    return users.map((u, i) => ({ position: i + 1, ...u }));
  }

  /**
   * Ranking semanal/mensal: vitórias ranqueadas no período corrente,
   * com rating como desempate.
   */
  private async periodLeaderboard(period: 'weekly' | 'monthly', limit: number) {
    const now = new Date();
    const since =
      period === 'weekly'
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = await this.prisma.$queryRaw<
      { id: string; username: string; displayName: string; avatarUrl: string | null; level: number; rating: number; wins: bigint }[]
    >`
      SELECT u.id, u.username, u."displayName", u."avatarUrl", u.level, u.rating,
             COUNT(*)::bigint AS wins
      FROM "MatchPlayer" mp
      JOIN "Match" m ON m.id = mp."matchId"
      JOIN "User" u ON u.id = mp."userId"
      WHERE m.status = 'FINISHED'
        AND m.ranked = true
        AND m."winnerTeam" = mp.team
        AND m."endedAt" >= ${since}
      GROUP BY u.id
      ORDER BY wins DESC, u.rating DESC
      LIMIT ${limit}
    `;
    return rows.map((r, i) => ({ position: i + 1, ...r, wins: Number(r.wins) }));
  }
}
