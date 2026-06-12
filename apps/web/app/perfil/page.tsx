'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

interface Me {
  username: string;
  displayName: string;
  email: string;
  level: number;
  xp: number;
  rating: number;
  coins: number;
  emailVerified: boolean;
  isPremium: boolean;
  stats: { matchesPlayed: number; wins: number; losses: number; winRate: number };
}

interface HistoryItem {
  id: string;
  mode: string;
  ranked: boolean;
  won: boolean;
  scoreTeam0: number;
  scoreTeam1: number;
  myTeam: number;
  xpEarned: number;
  ratingDelta: number;
  endedAt: string;
}

export default function PerfilPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!useAuth.getState().accessToken) {
      router.replace('/login');
      return;
    }
    api<Me>('/users/me').then(setMe).catch(() => router.replace('/login'));
    api<{ items: HistoryItem[] }>('/users/me/history')
      .then((h) => setHistory(h.items))
      .catch(() => undefined);
  }, [router]);

  if (!me) {
    return (
      <>
        <Navbar />
        <main className="p-10 text-center text-zinc-400">Carregando…</main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel flex flex-wrap items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-felt text-2xl font-black">
            {me.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black">
              {me.displayName}{' '}
              {me.isPremium && (
                <span className="rounded-lg bg-gold/20 px-2 py-0.5 text-sm text-gold">★ Premium</span>
              )}
            </h1>
            <p className="text-zinc-400">@{me.username}</p>
            {!me.emailVerified && (
              <p className="mt-1 text-sm text-amber-400">
                ⚠ E-mail não verificado. Confira sua caixa de entrada.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            <Stat label="Nível" value={me.level} />
            <Stat label="Rating" value={me.rating} />
            <Stat label="XP" value={me.xp} />
            <Stat label="Moedas" value={`🪙 ${me.coins}`} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Stat big label="Partidas" value={me.stats.matchesPlayed} />
          <Stat big label="Vitórias" value={me.stats.wins} />
          <Stat big label="Derrotas" value={me.stats.losses} />
          <Stat big label="Taxa de vitória" value={`${me.stats.winRate}%`} />
        </div>

        <h2 className="mt-10 text-xl font-bold">📜 Histórico de partidas</h2>
        <div className="panel mt-4 divide-y divide-white/5 p-0">
          {history.length === 0 && <p className="p-6 text-zinc-400">Nenhuma partida concluída ainda.</p>}
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-4 py-3">
              <span className={`font-bold ${h.won ? 'text-green-400' : 'text-red-400'}`}>
                {h.won ? 'Vitória' : 'Derrota'}
              </span>
              <span className="text-sm text-zinc-400">
                {h.mode === 'ONE_V_ONE' ? '1x1' : '2x2'}
                {h.ranked && ' · ranqueada'}
              </span>
              <span className="font-mono">
                {h.myTeam === 0 ? `${h.scoreTeam0}×${h.scoreTeam1}` : `${h.scoreTeam1}×${h.scoreTeam0}`}
              </span>
              <span className="text-sm text-zinc-400">
                +{h.xpEarned} XP
                {h.ratingDelta !== 0 && (
                  <span className={h.ratingDelta > 0 ? 'text-green-400' : 'text-red-400'}>
                    {' '}
                    {h.ratingDelta > 0 ? '+' : ''}
                    {h.ratingDelta}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string | number; big?: boolean }) {
  return (
    <div className={big ? 'panel text-center' : ''}>
      <p className={`font-black text-gold ${big ? 'text-2xl' : ''}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}
