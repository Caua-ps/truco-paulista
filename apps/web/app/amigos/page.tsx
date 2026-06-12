'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { IconSend } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { DirectMessage, useSocial } from '@/lib/social-store';
import { getGameSocket } from '@/lib/socket';

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
  const me = useAuth((s) => s.user);
  const { unread, clearUnread, setActiveChat, setNotice } = useSocial();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [username, setUsername] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Conversa aberta
  const [selected, setSelected] = useState<Friend | null>(null);
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Friend | null>(null);
  selectedRef.current = selected;

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
    const t = setInterval(() => void refresh(), 30_000);

    // Mensagens ao vivo da conversa aberta.
    const socket = getGameSocket();
    const onDm = (msg: DirectMessage) => {
      const open = selectedRef.current;
      const mine = useAuth.getState().user?.id;
      if (!open) return;
      const belongsHere =
        msg.fromUserId === open.id || (msg.fromUserId === mine && msg.toUserId === open.id);
      if (belongsHere) {
        setThread((t0) => (t0.some((m) => m.id === msg.id) ? t0 : [...t0, msg]));
        clearUnread(open.id);
      }
    };
    socket.on('dm:message', onDm);

    return () => {
      clearInterval(t);
      socket.off('dm:message', onDm);
      setActiveChat(null);
    };
  }, [router, refresh, clearUnread, setActiveChat]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // -------------------------------------------------------------------------
  // Amizades
  // -------------------------------------------------------------------------

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
    if (selected?.id === friend.id) closeChat();
    await api(`/friends/${friend.id}`, { method: 'DELETE' }).catch(() => undefined);
    void refresh();
  };

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  const openChat = async (friend: Friend) => {
    setSelected(friend);
    setActiveChat(friend.id);
    clearUnread(friend.id);
    setThread([]);
    try {
      setThread(await api<DirectMessage[]>(`/friends/${friend.id}/messages`));
    } catch {
      setThread([]);
    }
  };

  const closeChat = () => {
    setSelected(null);
    setActiveChat(null);
    setThread([]);
  };

  const sendDm = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selected) return;
    getGameSocket().emit(
      'dm:send',
      { toUserId: selected.id, text },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok && res?.error) setNotice(res.error);
      },
    );
    setDraft('');
  };

  // -------------------------------------------------------------------------
  // Convite direto para a mesa
  // -------------------------------------------------------------------------

  const inviteToTable = (friend: Friend) => {
    setInviting(friend.id);
    const socket = getGameSocket();
    const send = () =>
      socket.emit(
        'invite:send',
        { toUserId: friend.id },
        (res: { ok: boolean; code?: string; error?: string }) => {
          if (res?.ok && res.code) {
            setNotice(`Convite enviado para ${friend.displayName}! 🃏`);
            router.push(`/mesa/${res.code}`);
          } else if (res?.error === 'Crie uma mesa antes de convidar') {
            // Sem mesa ainda: cria uma 1x1 privada e convida na sequência.
            socket.emit(
              'room:create',
              { mode: '1v1', isPrivate: true },
              (created: { ok: boolean; code?: string }) => {
                if (created?.ok) send();
                else setNotice('Não foi possível criar a mesa');
              },
            );
          } else {
            setNotice(res?.error ?? 'Falha ao convidar');
            setInviting(null);
          }
        },
      );
    send();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-display text-4xl">👥 Amigos</h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(20rem,2fr)_3fr]">
          {/* ====================== Coluna: lista ====================== */}
          <div className={selected ? 'hidden lg:block' : ''}>
            <form onSubmit={sendRequest} className="panel flex flex-wrap items-center gap-3 !p-4">
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
                {sending ? '…' : 'Adicionar'}
              </button>
              {feedback && (
                <p className={`w-full text-sm ${feedback.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {feedback.text}
                </p>
              )}
            </form>

            {requests.length > 0 && (
              <section className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gold">Convites recebidos</h2>
                <div className="mt-2 space-y-2">
                  {requests.map((r) => (
                    <div key={r.id} className="glass flex items-center justify-between p-3">
                      <span>
                        <b>{r.requester.displayName}</b>{' '}
                        <span className="text-sm text-zinc-500">@{r.requester.username}</span>
                      </span>
                      <span className="flex gap-1.5">
                        <button
                          onClick={() => respond(r.id, true)}
                          className="btn-primary h-10 w-11 px-0 text-sm"
                          aria-label={`Aceitar convite de ${r.requester.displayName}`}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => respond(r.id, false)}
                          className="btn-secondary h-10 w-11 px-0 text-sm"
                          aria-label={`Recusar convite de ${r.requester.displayName}`}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 space-y-2">
              {friends === null && <p className="text-zinc-500">Carregando…</p>}
              {friends?.length === 0 && (
                <div className="panel text-center text-zinc-400">
                  <p className="text-3xl">🪑</p>
                  <p className="mt-2">Mesa vazia por enquanto. Adicione amigos pelo nome de usuário aí em cima.</p>
                </div>
              )}
              {friends?.map((f) => (
                <button
                  key={f.id}
                  onClick={() => openChat(f)}
                  className={`glass flex w-full items-center justify-between p-3 text-left transition hover:border-gold/40
                    ${selected?.id === f.id ? 'border-gold/50' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="relative">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-felt-light to-felt-dark text-sm font-black text-white">
                        {f.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-zinc-900 ${
                          f.online ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />
                    </span>
                    <span>
                      <b>{f.displayName}</b>
                      <span className={`block text-xs ${f.online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                        {f.online ? 'online' : 'offline'} · nível {f.level}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {(unread[f.id] ?? 0) > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {unread[f.id]}
                      </span>
                    )}
                    <span className="text-zinc-500">💬</span>
                  </span>
                </button>
              ))}
            </section>
          </div>

          {/* ====================== Coluna: conversa ====================== */}
          <div className={selected ? '' : 'hidden lg:block'}>
            {!selected ? (
              <div className="panel flex h-full min-h-[24rem] flex-col items-center justify-center text-zinc-500">
                <p className="text-4xl">💬</p>
                <p className="mt-3">Escolha um amigo para conversar</p>
              </div>
            ) : (
              <div className="panel flex h-[70vh] min-h-[24rem] flex-col !p-0">
                {/* Cabeçalho da conversa */}
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <span className="flex items-center gap-3">
                    <button onClick={closeChat} className="text-zinc-400 hover:text-zinc-200 lg:hidden">
                      ←
                    </button>
                    <b>{selected.displayName}</b>
                    <span className={`text-xs ${selected.online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {selected.online ? '● online' : '○ offline'}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => inviteToTable(selected)}
                      disabled={!selected.online || inviting === selected.id}
                      className="btn-primary px-4 py-1.5 text-sm"
                      title={selected.online ? 'Chamar para uma mesa' : 'Amigo offline'}
                    >
                      🃏 {inviting === selected.id ? 'Convidando…' : 'Chamar pra mesa'}
                    </button>
                    <button
                      onClick={() => remove(selected)}
                      className="px-2 text-sm text-zinc-600 transition hover:text-red-400"
                      title="Remover amigo"
                    >
                      remover
                    </button>
                  </span>
                </div>

                {/* Mensagens */}
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {thread.length === 0 && (
                    <p className="pt-8 text-center text-sm text-zinc-600">
                      Conversa nova. Manda um “bora trucar?” 🎙️
                    </p>
                  )}
                  {thread.map((m) => {
                    const mine = m.fromUserId === me?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <span
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-snug
                            ${mine ? 'rounded-br-sm bg-gold/20 text-zinc-100' : 'rounded-bl-sm bg-white/10 text-zinc-200'}`}
                        >
                          {m.text}
                          <span className="ml-2 align-bottom text-[10px] text-zinc-500">
                            {new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                {/* Caixa de envio */}
                <form onSubmit={sendDm} className="flex gap-2 border-t border-white/10 p-3">
                  <input
                    className="input min-h-11 flex-1 py-2"
                    placeholder={`Mensagem para ${selected.displayName}…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={500}
                    aria-label={`Mensagem para ${selected.displayName}`}
                  />
                  <button className="btn-primary min-h-11 px-4" aria-label="Enviar mensagem">
                    <IconSend className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
