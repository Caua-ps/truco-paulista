import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Loja cosmética e Premium.
 *
 * Política de monetização (invariantes do produto):
 *  - Nenhum item vendido concede vantagem competitiva — só cosméticos.
 *  - Premium remove anúncios e adiciona conveniências (estatísticas avançadas,
 *    histórico detalhado); nunca afeta o jogo.
 *  - Anúncios: no máximo 1 por partida CONCLUÍDA, nunca durante o gameplay.
 *    O cliente consulta /store/ad-eligibility após cada partida.
 */
@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  listItems() {
    return this.prisma.cosmeticItem.findMany({
      where: { active: true },
      orderBy: [{ type: 'asc' }, { priceCoins: 'asc' }],
    });
  }

  async myItems(userId: string) {
    return this.prisma.userCosmetic.findMany({
      where: { userId },
      include: { item: true },
    });
  }

  async purchase(userId: string, itemId: string) {
    const item = await this.prisma.cosmeticItem.findUnique({ where: { id: itemId } });
    if (!item || !item.active) throw new NotFoundException('Item indisponível');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const owned = await tx.userCosmetic.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (owned) throw new BadRequestException('Você já possui este item');
      if (user.coins < item.priceCoins) throw new BadRequestException('Moedas insuficientes');

      await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: item.priceCoins } },
      });
      return tx.userCosmetic.create({ data: { userId, itemId } });
    });
  }

  async equip(userId: string, itemId: string) {
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemId: { userId, itemId } },
      include: { item: true },
    });
    if (!owned) throw new NotFoundException('Você não possui este item');

    return this.prisma.$transaction(async (tx) => {
      // Apenas um item equipado por categoria.
      await tx.userCosmetic.updateMany({
        where: { userId, item: { type: owned.item.type } },
        data: { equipped: false },
      });
      return tx.userCosmetic.update({
        where: { userId_itemId: { userId, itemId } },
        data: { equipped: true },
      });
    });
  }

  /**
   * Decide se o cliente pode exibir um anúncio intersticial após a partida.
   * Premium nunca vê anúncios; demais usuários, no máximo 1 por partida concluída.
   */
  async adEligibility(userId: string, matchId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const isPremium =
      user.premiumLifetime || (user.premiumUntil !== null && user.premiumUntil > new Date());
    if (isPremium) return { showAd: false, reason: 'premium' };

    const played = await this.prisma.matchPlayer.findFirst({
      where: { userId, matchId, match: { status: 'FINISHED' } },
    });
    if (!played) return { showAd: false, reason: 'match-not-finished' };

    // Idempotência via SET NX: garante no máximo 1 anúncio por partida concluída.
    const adKey = `ad:${matchId}:${userId}`;
    const acquired = await this.redis.client
      .set(adKey, '1', 'EX', 7 * 24 * 60 * 60, 'NX')
      .catch(() => null);
    if (acquired !== 'OK') return { showAd: false, reason: 'already-shown' };

    return { showAd: true };
  }

  // -------------------------------------------------------------------------
  // Premium — a confirmação de pagamento real entra via webhook do provedor
  // (Stripe/Mercado Pago). Este método aplica o efeito da assinatura.
  // -------------------------------------------------------------------------

  async activatePremium(userId: string, plan: 'MONTHLY' | 'YEARLY' | 'LIFETIME', provider: string, externalId?: string) {
    const now = new Date();
    const periodEnd =
      plan === 'MONTHLY'
        ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
        : plan === 'YEARLY'
          ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
          : null;

    await this.prisma.$transaction([
      this.prisma.subscription.create({
        data: { userId, plan, provider, externalId, currentPeriodEnd: periodEnd },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: plan === 'LIFETIME' ? { premiumLifetime: true } : { premiumUntil: periodEnd },
      }),
    ]);
    return { ok: true, plan, premiumUntil: periodEnd };
  }
}
