// Seed de desenvolvimento: itens cosméticos iniciais e missões.
// Rodar: node apps/api/prisma/seed.mjs  (requer DATABASE_URL)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COSMETICS = [
  { type: 'AVATAR', name: 'Caipira Clássico', priceCoins: 200, rarity: 'COMMON', description: 'O avatar raiz.' },
  { type: 'AVATAR', name: 'Zé do Zap', priceCoins: 800, rarity: 'EPIC', description: 'Pra quem sempre tem o paus.' },
  { type: 'PROFILE_FRAME', name: 'Moldura Dourada', priceCoins: 500, rarity: 'RARE' },
  { type: 'TABLE_THEME', name: 'Mesa de Boteco', priceCoins: 600, rarity: 'RARE', description: 'Com direito a marca de copo.' },
  { type: 'TABLE_THEME', name: 'Feltro Azul-Real', priceCoins: 1000, rarity: 'EPIC' },
  { type: 'CARD_BACK', name: 'Verso Bandeirante', priceCoins: 300, rarity: 'COMMON' },
  { type: 'EMOJI_PACK', name: 'Pacote Deboche', priceCoins: 400, rarity: 'RARE', description: 'Risadas extras para o seis ladrão.' },
  { type: 'VISUAL_EFFECT', name: 'Zap em Chamas', priceCoins: 1200, rarity: 'LEGENDARY', description: 'Manilha de paus pega fogo ao cair.' },
];

const MISSIONS = [
  { code: 'daily_play_3', name: 'Jogue 3 partidas', period: 'DAILY', target: 3, xpReward: 50, coinReward: 20 },
  { code: 'daily_win_1', name: 'Vença 1 partida', period: 'DAILY', target: 1, xpReward: 40, coinReward: 15 },
  { code: 'weekly_win_10', name: 'Vença 10 partidas na semana', period: 'WEEKLY', target: 10, xpReward: 300, coinReward: 100 },
  { code: 'weekly_truco_15', name: 'Peça truco 15 vezes', period: 'WEEKLY', target: 15, xpReward: 200, coinReward: 80 },
];

for (const item of COSMETICS) {
  const existing = await prisma.cosmeticItem.findFirst({ where: { name: item.name } });
  if (!existing) await prisma.cosmeticItem.create({ data: item });
}

for (const mission of MISSIONS) {
  await prisma.mission.upsert({
    where: { code: mission.code },
    update: mission,
    create: mission,
  });
}

console.log('Seed concluído.');
await prisma.$disconnect();
