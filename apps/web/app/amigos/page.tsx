'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  online: boolean;
}

interface FriendRequest {
  id: string;
  requester: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

export default function AmigosPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [username, setUsername] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        api<Friend[]>('/friends'),
        api<FriendRequest[]>('/friends/requests'),
      ]);
      setFriends(f);
      setRequests(r);
    } catch {
      setFriends([]);
    }
  }, []);

  useEffect(() => {
    if (!useAuth.getState().accessToken) {
      router.replace('/login?next=/amigos');
      return;
    }
    void refresh();
    // Presença muda com o tempo: atualiza a cada 30s.
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [router, refresh]);

  const sendRequest = async (e: FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setSending(true);
    setFeedback(null);
    try {
      await api('/friends/requests', { method: 'POST', body: JSON.stringify({ username: name }) });
      setFeedback({ kind: 'ok', text: `Convite enviado para @${name}!` });
      setUsername('');
      void refresh();
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'Falha ao enviar convite' });
    } finally {
      setSending(false);
    }
  };

  const respond = async (id: string, accept: boolean) => {
    await api(`/friends/requests/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }).catch(() => undefined);
    void refresh();
  };

  const remove = async (friend: Friend) => {
    if (!window.confirm(`Remover ${friend.displayName} dos amigos?`)) return;
    await api(`/friends/${friend.id}`, { method: 'DELETE' }).catch(() => undefined);
    void refresh();
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-4xl">👥 Amigos</h1>

        {/* Adicionar amigo */}
        <form onSubmit={sendRequest} className="panel mt-6 flex flex-wrap items-center gap-3">
          <input
            className="input flex-1"
            placeholder="Nome de usuário do amigo"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={20}
            required
          />
          <button className="btn-primary" disabled={sending}>
            {sending ? 'Enviando…' : 'Adicionar'}
          </button>
          {feedback && (
            <p className={`w-full text-sm ${feedback.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {feedback.text}
            </p>
          )}
        </form>

        {/* Convites pendentes */}
        {requests.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-gold">Convites recebidos</h2>
            <div className="mt-3 space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="panel flex items-center justify-between py-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-zinc-600 to-zinc-800 text-sm font-black">
                      {r.requester.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <b>{r.requester.displayName}</b>{' '}
                      <span className="text-sm text-zinc-500">@{r.requester.username}</span>
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button onClick={() => respond(r.id, true)} className="btn-primary px-3 py-1.5 text-sm">
                      Aceitar
                    </button>
                    <button onClick={() => respond(r.id, false)} className="btn-secondary px-3 py-1.5 text-sm">
                      Recusar
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lista de amigos */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-zinc-300">
            Sua turma {friends && friends.length > 0 && <span className="text-zinc-500">({friends.length})</span>}
          </h2>
          <div className="mt-3 space-y-2">
            {friends === null && <p className="text-zinc-500">Carregando…</p>}
            {friends?.length === 0 && (
              <div className="panel text-center text-zinc-400">
                <p className="text-3xl">🪑</p>
                <p className="mt-2">
                  Mesa vazia por enquanto — adicione amigos pelo nome de usuário acima,
                  <br />
                  ou mande o link de convite de uma mesa direto no grupo.
                </p>
              </div>
            )}
            {friends?.map((f) => (
              <div key={f.id} className="panel flex items-center justify-between py-4">
                <span className="flex items-center gap-3">
                  <span className="relative">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-felt-light to-felt-dark text-sm font-black text-white">
                      {f.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-zinc-900 ${
                        f.online ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                      title={f.online ? 'Online' : 'Offline'}
                    />
                  </span>
                  <span>
                    <b>{f.displayName}</b>{' '}
                    <span className="text-sm text-zinc-500">@{f.username} · nível {f.level}</span>
                    <span className={`ml-2 text-xs ${f.online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {f.online ? '● online' : '○ offline'}
                    </span>
                  </span>
                </span>
                <button
                  onClick={() => remove(f)}
                  className="text-sm text-zinc-600 transition hover:text-red-400"
                  title="Remover amigo"
                >
                  remover
                </button>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-zinc-500">
          💡 Para jogar junto: crie uma mesa no <a href="/lobby" className="text-gold hover:underline">lobby</a> e
          use “copiar link de convite” — quem clicar cai direto na sua mesa.
        </p>
      </main>
    </>
  );
}
