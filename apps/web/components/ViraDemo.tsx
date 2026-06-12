'use client';

import { manilhaRank, RANK_ORDER, type Card, type Rank, type Suit } from '@truco/game-core';
import { useState } from 'react';

/**
 * Assinatura da landing: a regra central do Paulista, viva.
 * Toque no monte → o motor real do jogo (manilhaRank) calcula as novas manilhas.
 */

const SUIT_SYMBOL: Record<Suit, string> = {
  ouros: '♦',
  espadas: '♠',
  copas: '♥',
  paus: '♣',
};
const RED_SUITS = new Set<Suit>(['ouros', 'copas']);
const SUITS: Suit[] = ['ouros', 'espadas', 'copas', 'paus'];

function randomVira(current: Rank): Card {
  const others = RANK_ORDER.filter((r) => r !== current);
  const rank = others[Math.floor(Math.random() * others.length)] as Rank;
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)] as Suit;
  return { rank, suit };
}

function DemoCard({ rank, suit, zap = false }: { rank: string; suit: Suit; zap?: boolean }) {
  const red = RED_SUITS.has(suit);
  return (
    <div
      className={`relative flex h-40 w-28 flex-col items-center justify-center rounded-2xl border border-zinc-200
        bg-gradient-to-br from-white via-zinc-50 to-zinc-200 font-display shadow-[0_20px_50px_rgba(0,0,0,0.55)]
        sm:h-52 sm:w-36 ${red ? 'text-red-600' : 'text-zinc-900'}
        ${zap ? 'ring-1 ring-gold shadow-glow' : ''}`}
    >
      <span className="absolute left-2.5 top-1.5 text-xl font-bold sm:text-2xl">{rank}</span>
      <span className="text-6xl drop-shadow-sm sm:text-7xl">{SUIT_SYMBOL[suit]}</span>
      <span className="absolute bottom-1.5 right-2.5 rotate-180 text-xl font-bold sm:text-2xl">{rank}</span>
    </div>
  );
}

/**
 * As 4 manilhas, da mais fraca para o zap: ♦ ouros < ♠ espadas < ♥ copas < ♣ paus.
 * Os delays começam após o flip da vira terminar (0.35s de espera + 0.7s de giro):
 * primeiro a vira conta a história, depois as manilhas respondem em cascata.
 */
const FAN_SLOTS: { suit: Suit; pos: string; rot: string; z: string; delay: string }[] = [
  { suit: 'ouros', pos: 'left-0 top-4', rot: '-rotate-[15deg]', z: 'z-10', delay: '700ms' },
  { suit: 'espadas', pos: 'left-[21%] top-0.5', rot: '-rotate-[5deg]', z: 'z-20', delay: '820ms' },
  { suit: 'copas', pos: 'left-[42%] top-0.5', rot: 'rotate-[5deg]', z: 'z-30', delay: '940ms' },
  { suit: 'paus', pos: 'left-[63%] top-4', rot: 'rotate-[15deg]', z: 'z-40', delay: '1060ms' },
];

export function ViraDemo() {
  const [vira, setVira] = useState<Card>({ rank: '2', suit: 'ouros' });
  const [flips, setFlips] = useState(0);
  const manilha = manilhaRank(vira);

  const turn = () => {
    setVira((v) => randomVira(v.rank));
    setFlips((f) => f + 1);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative h-[340px] overflow-hidden rounded-[2rem] sm:h-[400px]">
        {/* Mesa */}
        <div
          aria-hidden
          className="table-felt absolute inset-x-0 bottom-0 top-10 rounded-[50%] border-[10px] border-wood shadow-table"
        />
        <div aria-hidden className="absolute inset-x-4 bottom-4 top-14 rounded-[50%] border border-gold/15" />

        {/* Monte + vira: clicável — o coração da demo */}
        <button
          type="button"
          onClick={turn}
          aria-label="Virar nova carta do monte para ver as manilhas mudarem"
          className="group absolute left-[7%] top-[10%] z-50 cursor-pointer rounded-2xl"
        >
          <span aria-hidden className="absolute -left-1.5 -top-1.5 block h-28 w-20 -rotate-12 rounded-xl border border-[#9b1c1c] bg-[#7f1d1d] shadow-card transition group-hover:-rotate-[15deg]" />
          <span aria-hidden className="absolute -left-0.5 -top-0.5 block h-28 w-20 -rotate-6 rounded-xl border border-[#9b1c1c] bg-[#8a1f1f] shadow-card transition group-hover:-rotate-[8deg]" />
          <span className="relative block" style={{ perspective: '700px' }}>
            <span
              key={flips}
              className="relative block h-28 w-20 animate-vira-flip"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Verso */}
              <span
                aria-hidden
                className="absolute inset-0 block rotate-3 rounded-xl border border-[#9b1c1c] bg-[#7f1d1d] shadow-card"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span
                  className="absolute inset-[3px] block rounded-[inherit] border border-white/40"
                  style={{
                    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 7px),
                      repeating-linear-gradient(-45deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 7px)`,
                  }}
                />
              </span>
              {/* Face da vira */}
              <span
                className={`absolute inset-0 flex rotate-3 flex-col items-center justify-center rounded-xl border border-zinc-200
                  bg-gradient-to-br from-white via-zinc-50 to-zinc-200 font-display shadow-card
                  ${RED_SUITS.has(vira.suit) ? 'text-red-600' : 'text-zinc-900'}`}
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg) rotate(3deg)' }}
              >
                <span className="absolute left-2 top-1 text-base font-bold">{vira.rank}</span>
                <span className="text-4xl">{SUIT_SYMBOL[vira.suit]}</span>
                <span className="absolute bottom-1 right-2 rotate-180 text-base font-bold">{vira.rank}</span>
              </span>
            </span>
          </span>
        </button>

        {/* As 4 manilhas da vez: leque contido numa caixa de tamanho fixo, sempre
            dentro da mesa — nada vaza sobre o texto */}
        <div aria-hidden className="absolute inset-x-0 bottom-4 flex justify-center sm:bottom-6">
          <div className="relative h-[176px] w-[304px] sm:h-[224px] sm:w-[392px]">
            {FAN_SLOTS.map((slot) => (
              <div key={slot.suit} className={`absolute ${slot.pos} ${slot.rot} ${slot.z}`}>
                <div
                  key={`${slot.suit}-${flips}`}
                  className="animate-pop-in [animation-fill-mode:backwards]"
                  style={{ animationDelay: slot.delay }}
                >
                  <DemoCard rank={manilha} suit={slot.suit} zap={slot.suit === 'paus'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dica de interação — fora da cena, sem invadir a mesa */}
      <p className="mt-5 text-center text-sm text-zinc-400">
        <button
          type="button"
          onClick={turn}
          className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 transition hover:border-gold/40 hover:text-gold"
        >
          ↻ virou <b className="text-zinc-200">{vira.rank}{SUIT_SYMBOL[vira.suit]}</b>, manilha é{' '}
          <b className="text-gold">{manilha}</b>. Toca no monte pra virar de novo
        </button>
      </p>
    </div>
  );
}
