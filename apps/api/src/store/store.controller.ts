import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { StoreService } from './store.service';

class SubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY', 'LIFETIME'])
  plan: 'MONTHLY' | 'YEARLY' | 'LIFETIME';

  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}

@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('items')
  items() {
    return this.store.listItems();
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-items')
  myItems(@CurrentUser() user: AuthenticatedUser) {
    return this.store.myItems(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items/:id/purchase')
  purchase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.store.purchase(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items/:id/equip')
  equip(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.store.equip(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('ad-eligibility/:matchId')
  adEligibility(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.store.adEligibility(user.id, matchId);
  }

  /**
   * Em produção, este endpoint é substituído por um webhook assinado do
   * provedor de pagamento. Mantido para desenvolvimento/sandbox.
   */
  @UseGuards(JwtAuthGuard)
  @Post('premium/subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.store.activatePremium(user.id, dto.plan, dto.provider, dto.externalId);
  }
}
