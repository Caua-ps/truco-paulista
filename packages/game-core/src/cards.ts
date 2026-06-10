import {
  ALL_SUITS,
  Card,
  MANILHA_SUIT_ORDER,
  RANK_ORDER,
  Rank,
} from './types';

/** Cria o baralho de 40 cartas do Truco Paulista (sem 8, 9 e curingas). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of RANK_ORDER) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Rank da manilha: o seguinte ao da vira na ordem 4,5,6,7,Q,J,K,A,2,3 (circular). */
export function manilhaRank(vira: Card): Rank {
  const idx = RANK_ORDER.indexOf(vira.rank);
  const next = RANK_ORDER[(idx + 1) % RANK_ORDER.length];
  // RANK_ORDER é constante e não-vazio; o acesso circular nunca é undefined.
  return next as Rank;
}

export function isManilha(card: Card, vira: Card): boolean {
  return card.rank === manilhaRank(vira);
}

/**
 * Força absoluta de uma carta dada a vira.
 * Cartas comuns: 0..9 (empatam entre si quando mesmo rank).
 * Manilhas: 100 + força do naipe (ouros < espadas < copas < paus) — nunca empatam.
 */
export function cardStrength(card: Card, vira: Card): number {
  if (isManilha(card, vira)) {
    return 100 + MANILHA_SUIT_ORDER.indexOf(card.suit);
  }
  return RANK_ORDER.indexOf(card.rank);
}

/** Compara duas cartas dada a vira: >0 se a vence b, 0 se empatam, <0 se b vence a. */
export function compareCards(a: Card, b: Card, vira: Card): number {
  return cardStrength(a, vira) - cardStrength(b, vira);
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function cardLabel(card: Card): string {
  const suitSymbol: Record<string, string> = {
    ouros: '♦',
    espadas: '♠',
    copas: '♥',
    paus: '♣',
  };
  return `${card.rank}${suitSymbol[card.suit]}`;
}
