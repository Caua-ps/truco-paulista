import { describe, expect, it } from 'vitest';
import {
  Card,
  cardStrength,
  compareCards,
  createDeck,
  isManilha,
  manilhaRank,
  mulberry32,
  shuffle,
} from '../src/index.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('baralho', () => {
  it('tem 40 cartas únicas (sem 8, 9 e curingas)', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    const keys = new Set(deck.map((card) => `${card.rank}-${card.suit}`));
    expect(keys.size).toBe(40);
    expect(deck.some((card) => (card.rank as string) === '8')).toBe(false);
  });

  it('embaralha deterministicamente com seed', () => {
    const a = shuffle(createDeck(), mulberry32(42));
    const b = shuffle(createDeck(), mulberry32(42));
    expect(a).toEqual(b);
  });
});

describe('manilhas', () => {
  it('a manilha é o rank seguinte ao da vira', () => {
    expect(manilhaRank(c('7', 'copas'))).toBe('Q');
    expect(manilhaRank(c('4', 'ouros'))).toBe('5');
    expect(manilhaRank(c('3', 'paus'))).toBe('4'); // circular
    expect(manilhaRank(c('A', 'espadas'))).toBe('2');
  });

  it('identifica manilhas', () => {
    const vira = c('7', 'copas');
    expect(isManilha(c('Q', 'paus'), vira)).toBe(true);
    expect(isManilha(c('K', 'paus'), vira)).toBe(false);
  });

  it('ordena manilhas por naipe: zap > copas > espadas > ouros', () => {
    const vira = c('7', 'copas'); // manilha = Q
    const zap = cardStrength(c('Q', 'paus'), vira);
    const copas = cardStrength(c('Q', 'copas'), vira);
    const espadas = cardStrength(c('Q', 'espadas'), vira);
    const ouros = cardStrength(c('Q', 'ouros'), vira);
    expect(zap).toBeGreaterThan(copas);
    expect(copas).toBeGreaterThan(espadas);
    expect(espadas).toBeGreaterThan(ouros);
    // Qualquer manilha vence a carta comum mais forte (3).
    expect(ouros).toBeGreaterThan(cardStrength(c('3', 'paus'), vira));
  });
});

describe('força das cartas comuns', () => {
  const vira = c('5', 'ouros'); // manilha = 6

  it('segue a ordem 4 < 5 < 7 < Q < J < K < A < 2 < 3', () => {
    const order: Card[] = [
      c('4', 'paus'),
      c('5', 'paus'),
      c('7', 'paus'),
      c('Q', 'paus'),
      c('J', 'paus'),
      c('K', 'paus'),
      c('A', 'paus'),
      c('2', 'paus'),
      c('3', 'paus'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(compareCards(order[i]!, order[i - 1]!, vira)).toBeGreaterThan(0);
    }
  });

  it('cartas comuns de mesmo rank empatam (naipe não desempata)', () => {
    expect(compareCards(c('3', 'paus'), c('3', 'ouros'), vira)).toBe(0);
  });
});
