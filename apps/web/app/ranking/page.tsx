'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';

interface RankingRow {
  position: number;
  username: string;
  displayName: string;
  level: number;
  rating: number;
  wins?: number;
}

const PERIODS = [
  { key: 'global', label: 'Global' },
  { key: 'weekly', label: 'Semanal' },
  { key: 'monthly', label: 'Mensal' },
] as const;

export default function RankingPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('global');
  const [rows, setRows] = useState<RankingRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    api<RankingRow[]>(`/ranking?period=${period}`, { auth: false })
      .then(setRows)
      .catch(() => setRows([]));
  }, [period]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl">🏆 Ranking</h1>
        <div className="mt-6 flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={period === p.key ? 'btn-primary' : 'btn-secondary'}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="panel mt-6 overflow-hidden p-0">
          {rows === null ? (
            <p className="p-6 text-zinc-400">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-zinc-400">Sem dados ainda — jogue a primeira partida!</p>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-black/40 text-sm text-zinc-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Jogador</th>
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3 text-right">
                    {period === 'global' ? 'Rating' : 'Vitórias'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.username} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-bold text-gold">
                      {r.position <= 3 ? ['🥇', '🥈', '🥉'][r.position - 1] : r.position}
                    </td>
                    <td className="px-4 py-3">
                      <b>{r.displayName}</b>{' '}
                      <span className="text-sm text-zinc-500">@{r.username}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{r.level}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {period === 'global' ? r.rating : (r.wins ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
