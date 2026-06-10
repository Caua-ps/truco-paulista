import { Controller, Get, Query } from '@nestjs/common';
import { RankingPeriod, RankingService } from './ranking.service';

@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get()
  leaderboard(@Query('period') period?: string, @Query('limit') limit?: string) {
    const validPeriod: RankingPeriod = ['weekly', 'monthly'].includes(period ?? '')
      ? (period as RankingPeriod)
      : 'global';
    const safeLimit = Math.min(100, Math.max(10, Number(limit) || 50));
    return this.ranking.leaderboard(validPeriod, safeLimit);
  }
}
