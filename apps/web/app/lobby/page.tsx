'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { IconLock, IconTicket, IconTrophy, IconZap } from '@/components/icons';
import { useAuth } from '@/lib/auth-store';
import { getGameSocket } from '@/lib/socket';
import type { GameMode } from '@truco/game-core';

export default function LobbyPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [searching, setSearching] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!useAuth.getState().accessToken) {
      router.replace('/login');
      return;
    }
    const socket = getGameSocket();
    const onMatched = ({ code }: { code: string }) => router.push(`/mesa/${code}`);
    socket.on('queue:matched', onMatched);
    return () => {
      socket.off('queue:matched', onMatched);
    };
  }, [router]);

  const enterQueue = (mode: GameMode, ranked: boolean) => {
    setError(null);
    const label = `${mode}${ranked ? ' ranqueada' : ''}`;
    const socket = getGameSocket();
    socket.emit('queue:join', { mode, ranked }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setError(res?.error ?? 'Falha ao entrar na fila');
      else setSearching(label);
    });
  };

  const cancelQueue = () => {
    getGameSocket().emit('queue:leave');
    setSearching(null);
  };

  const createRoom = (mode: GameMode) => {
    setError(null);
    getGameSocket().emit(
      'room:create',
      { mode, isPrivate: true },
      (res: { ok: boolean; code?: string; error?: string }) => {
        if (res?.ok && res.code) router.push(`/mesa/${res.code}`);
        else setError(res?.error ?? 'Falha ao criar sala');
      },
    );
  };

  const joinRoom = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    getGameSocket().emit(
      'room:join',
      { code: joinCode.trim().toUpperCase() },
      (res: { ok: boolean; code?: string; error?: string }) => {
        if (res?.ok && res.code) router.push(`/mesa/${res.code}`);
        else setError(res?.error ?? 'Sala não encontrada');
      },
    );
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl">
          Olá, <em className="text-gold">{user?.displayName ?? 'jogador'}</em> 👋
        </h1>
        <p className="mt-1 text-zinc-400">Escolha como quer jogar.</p>

        {error && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-red-300">{error}</p>}

        {searching ? (
          <div className="panel mt-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent" />
            <p className="mt-4 text-lg">Procurando partida {searching}…</p>
            <button onClick={cancelQueue} className="btn-secondary mt-6">
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="panel">
                <h2 className="flex items-center gap-2.5 font-display text-2xl text-gold">
                  <IconZap className="h-5 w-5" /> Partida rápida
                </h2>
                <p className="mt-1 text-sm text-zinc-400">Matchmaking automático, sem rating.</p>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => enterQueue('1v1', false)} className="btn-primary flex-1">
                    1 x 1
                  </button>
                  <button onClick={() => enterQueue('2v2', false)} className="btn-primary flex-1">
                    2 x 2
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2 className="flex items-center gap-2.5 font-display text-2xl text-gold">
                  <IconTrophy className="h-5 w-5" /> Ranqueada
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Vale rating ({user?.rating ?? 1000}). Pareamento por habilidade.
                </p>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => enterQueue('1v1', true)} className="btn-primary flex-1">
                    1 x 1
                  </button>
                  <button onClick={() => enterQueue('2v2', true)} className="btn-primary flex-1">
                    2 x 2
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="panel">
                <h2 className="flex items-center gap-2.5 font-display text-2xl text-gold">
                  <IconLock className="h-5 w-5" /> Sala privada
                </h2>
                <p className="mt-1 text-sm text-zinc-400">Crie e convide amigos pelo código.</p>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => createRoom('1v1')} className="btn-secondary flex-1">
                    Mesa 1x1
                  </button>
                  <button onClick={() => createRoom('2v2')} className="btn-secondary flex-1">
                    Mesa 2x2
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2 className="flex items-center gap-2.5 font-display text-2xl text-gold">
                  <IconTicket className="h-5 w-5" /> Entrar com código
                </h2>
                <form onSubmit={joinRoom} className="mt-4 flex gap-3">
                  <input
                    className="input flex-1 uppercase tracking-widest"
                    placeholder="ABC123"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <button className="btn-primary">Entrar</button>
                </form>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
