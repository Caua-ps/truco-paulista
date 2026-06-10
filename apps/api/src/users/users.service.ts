import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** XP necessário para passar do nível n para n+1. */
export function xpForLevel(level: number): number {
  return 100 * level;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return level;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const stats = await this.statsFor(userId);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      xp: user.xp,
      level: user.level,
      rating: user.rating,
      coins: user.coins,
      emailVerified: user.emailVerifiedAt !== null,
      isPremium: user.premiumLifetime || (user.premiumUntil !== null && user.premiumUntil > new Date()),
      stats,
    };
  }

  /** Perfil público — sem e-mail nem dados sensíveis. */
  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        xp: true,
        level: true,
        rating: true,
        premiumLifetime: true,
        premiumUntil: true,
        createdAt: true,
        cosmetics: {
          where: { equipped: true },
          select: { item: { select: { type: true, name: true, assetUrl: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Jogador não encontrado');
    const stats = await this.statsFor(user.id);
    const online = await this.redis.isOnline(user.id);
    return {
      ...user,
      isPremium: user.premiumLifetime || (user.premiumUntil !== null && user.premiumUntil > new Date()),
      premiumUntil: undefined,
      premiumLifetime: undefined,
      online,
      stats,
    };
  }

  async updateProfile(userId: string, data: { displayName?: string; avatarUrl?: string }) {
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getMe(userId);
  }

  async matchHistory(userId: string, page = 1, pageSize = 20) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.matchPlayer.count({ where: { userId, match: { status: 'FINISHED' } } }),
      this.prisma.matchPlayer.findMany({
        where: { userId, match: { status: 'FINISHED' } },
        orderBy: { match: { endedAt: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          team: true,
          seat: true,
          xpEarned: true,
          ratingDelta: true,
          match: {
            select: {
              id: true,
              mode: true,
              ranked: true,
              winnerTeam: true,
              scoreTeam0: true,
              scoreTeam1: true,
              startedAt: true,
              endedAt: true,
              players: {
                select: {
                  seat: true,
                  team: true,
                  user: { select: { username: true, displayName: true, avatarUrl: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((mp) => ({
        ...mp.match,
        myTeam: mp.team,
        won: mp.match.winnerTeam === mp.team,
        xpEarned: mp.xpEarned,
        ratingDelta: mp.ratingDelta,
      })),
    };
  }

  /** Eventos brutos da partida para replay no cliente. */
  async matchReplay(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          select: { seat: true, team: true, user: { select: { username: true, displayName: true } } },
        },
        events: { orderBy: { seq: 'asc' }, select: { seq: true, type: true, payload: true } },
      },
    });
    if (!match || match.status !== 'FINISHED') {
      throw new NotFoundException('Replay indisponível');
    }
    return match;
  }

  async addXp(userId: string, amount: number): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const xp = user.xp + amount;
    await this.prisma.user.update({
      where: { id: userId },
      data: { xp, level: levelFromXp(xp) },
    });
  }

  private async statsFor(userId: string) {
    const total = await this.prisma.matchPlayer.count({
      where: { userId, match: { status: 'FINISHED' } },
    });
    const winsRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "MatchPlayer" mp
      JOIN "Match" m ON m.id = mp."matchId"
      WHERE mp."userId" = ${userId} AND m.status = 'FINISHED' AND m."winnerTeam" = mp.team
    `;
    const wins = Number(winsRows[0]?.count ?? 0);
    return {
      matchesPlayed: total,
      wins,
      losses: total - wins,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    };
  }
}
