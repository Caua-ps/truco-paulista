'use client';

import type { Card } from '@truco/game-core';
import type { CSSProperties } from 'react';

const SUIT_SYMBOL: Record<Card['suit'], string> = {
  ouros: '♦',
  espadas: '♠',
  copas: '♥',
  paus: '♣',
};

const RED_SUITS = new Set<Card['suit']>(['ouros', 'copas']);

export type CardSize = 'sm' | 'md' | 'lg';

const FRAME: Record<CardSize, string> = {
  sm: 'h-16 w-11 rounded-lg',
  md: 'h-24 w-16 rounded-xl sm:h-28 sm:w-[4.75rem]',
  lg: 'h-32 w-[5.5rem] rounded-xl sm:h-36 sm:w-24',
};

const CENTER: Record<CardSize, string> = {
  sm: 'text-2xl',
  md: 'text-4xl sm:text-5xl',
  lg: 'text-5xl sm:text-6xl',
};

const CORNER: Record<CardSize, string> = {
  sm: 'text-[10px] leading-none',
  md: 'text-sm leading-none',
  lg: 'text-base leading-none',
};

/** Face de carta: cantos espelhados, naipe central e brilho dourado para manilha. */
export function CardFace({
  card,
  size = 'md',
  manilha = false,
  selected = false,
  dimmed = false,
  className = '',
}: {
  card: Card;
  size?: CardSize;
  manilha?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  className?: string;
}) {
  const red = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOL[card.suit];
  return (
    <div
      className={`relative flex select-none flex-col items-center justify-center border
        bg-gradient-to-br from-white via-zinc-50 to-zinc-200 font-display shadow-card
        ${FRAME[size]} ${red ? 'text-red-600' : 'text-zinc-900'}
        ${manilha ? 'border-gold shadow-[0_0_16px_rgba(212,169,66,0.55),0_8px_20px_rgba(0,0,0,0.45)]' : 'border-zinc-300'}
        ${selected ? 'ring-2 ring-gold shadow-card-lifted' : ''}
        ${dimmed ? 'brightness-75 saturate-50' : ''}
        ${className}`}
      aria-label={`${card.rank} de ${card.suit}${manilha ? ' (manilha)' : ''}`}
    >
      <span className={`absolute left-1.5 top-1.5 flex flex-col items-center ${CORNER[size]}`}>
        <b>{card.rank}</b>
        <span>{symbol}</span>
      </span>
      <span className={`${CENTER[size]} drop-shadow-sm`}>{symbol}</span>
      <span className={`absolute bottom-1.5 right-1.5 flex rotate-180 flex-col items-center ${CORNER[size]}`}>
        <b>{card.rank}</b>
        <span>{symbol}</span>
      </span>
      {manilha && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-gold-light to-gold text-[10px] shadow">
          ★
        </span>
      )}
    </div>
  );
}

/** Verso de carta: vinho com treliça e filete interno, estilo baralho de boteco. */
export function CardBack({
  size = 'md',
  className = '',
  style,
}: {
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative select-none border border-[#9b1c1c] bg-[#7f1d1d] shadow-card ${FRAME[size]} ${className}`}
      style={style}
      aria-label="Carta virada para baixo"
    >
      <div
        className="absolute inset-[3px] rounded-[inherit] border border-white/40"
        style={{
          backgroundImage: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 7px),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 7px),
            radial-gradient(circle at 50% 50%, #991b1b 0%, #7f1d1d 70%)`,
        }}
      />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg text-white/30">
        🃏
      </span>
    </div>
  );
}

/** Carta genérica: face ou verso. */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  manilha = false,
  selected = false,
  dimmed = false,
  className = '',
  style,
}: {
  card: Card | null;
  faceDown?: boolean;
  size?: CardSize;
  manilha?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (faceDown || !card) {
    return <CardBack size={size} className={className} style={style} />;
  }
  return (
    <div className={className} style={style}>
      <CardFace card={card} size={size} manilha={manilha} selected={selected} dimmed={dimmed} />
    </div>
  );
}

/**
 * Vira com animação: entra de costas e gira em 3D revelando a carta.
 * Use `key` ligado à carta no ponto de uso para reanimar a cada mão.
 */
export function ViraFlip({ card, size = 'sm' }: { card: Card; size?: CardSize }) {
  return (
    <div style={{ perspective: '700px' }}>
      <div className={`relative ${FRAME[size]} animate-vira-flip`} style={{ transformStyle: 'preserve-3d' }}>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <CardBack size={size} className="!h-full !w-full" />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <CardFace card={card} size={size} className="!h-full !w-full" />
        </div>
      </div>
    </div>
  );
}
