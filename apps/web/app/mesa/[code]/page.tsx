'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardBack, PlayingCard, ViraFlip } from '@/components/PlayingCard';
import { IconMessageCircle, IconSend, IconVolume, IconVolumeOff } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useSocial } from '@/lib/social-store';
import { getGameSocket } from '@/lib/socket';
import { isMuted, setMuted, sfx } from '@/lib/sound';
import {
  isManilha,
  manilhaRank,
  type GameAction,
  type GameEvent,
  type PlayerView,
} from '@truco/game-core';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface RoomSummary {
  id: string;
  code: string;
  mode: '1v1' | '2v2';
  ranked: boolean;
  hostId: string;
  started: boolean;
  seriesScore?: [number, number];
  rematchVotes?: string[];
  players: {
    userId: string;
    username: string;
    displayName: string;
    seat: number;
    team: number;
    ready: boolean;
    connected: boolean;
  }[];
}

interface ChatMsg {
  id: string;
  userId: string;
  username: string;
  text: string;
  at: number;
}

interface DragState {
  index: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

const QUICK_EMOJIS = ['👍', '😂', '😮', '😡', '🃏', '🔥', '🤝', '😎'];

const STAKE_SHOUT: Record<number, string> = { 3: 'TRUCO! 🔥', 6: 'SEIS!', 9: 'NOVE!', 12: 'DOZE!!' };
const STAKE_LABEL: Record<number, string> = { 1: 'TRUCO', 3: 'SEIS', 6: 'NOVE', 9: 'DOZE' };

/** Posição relativa de um assento em relação ao meu (0 = eu). */
const relSeat = (seat: number, mySeat: number, n: number) => (seat - mySeat + n) % n;

/** Deslocamento das cartas jogadas no centro, por posição relativa. */
function playedOffset(rel: number, n: number) {
  if (n === 2) {
    return rel === 0 ? { x: 0, y: 48, r: -4 } : { x: 0, y: -48, r: 5 };
  }
  switch (rel) {
    case 0:
      return { x: 0, y: 56, r: -4 };
    case 1:
      return { x: 84, y: 0, r: 8 };
    case 2:
      return { x: 0, y: -56, r: -5 };
    default:
      return { x: -84, y: 0, r: -8 };
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function MesaPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const me = useAuth((s) => s.user);

  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [emojis, setEmojis] = useState<{ id: number; emoji: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [soundOff, setSoundOff] = useState(false);
  const [dealKey, setDealKey] = useState(0);

  // Drag & drop
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overZone, setOverZone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  /** Próxima carta sai virada para baixo (válido a partir da 2ª rodada). */
  const [coverMode, setCoverMode] = useState(false);
  /** Relógio da decisão corrente (timer de turno do servidor). */
  const [turnInfo, setTurnInfo] = useState<{ seat: number; deadline: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Amigos online para convite direto (pré-jogo). */
  const [onlineFriends, setOnlineFriends] = useState<{ id: string; displayName: string }[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const setNotice = useSocial((s) => s.setNotice);
  const dropRef = useRef<HTMLDivElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatOpenRef = useRef(chatOpen);
  const myTeamRef = useRef(0);
  const prevCanPlayRef = useRef(false);
  chatOpenRef.current = chatOpen;

  useEffect(() => {
    setSoundOff(isMuted());
  }, []);

  // -------------------------------------------------------------------------
  // Socket
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!useAuth.getState().accessToken) {
      router.replace(`/login?next=/mesa/${code}`);
      return;
    }
    const socket = getGameSocket();

    const onRoom = (r: RoomSummary) => setRoom(r);
    const onState = (v: PlayerView) => {
      myTeamRef.current = v.seat % 2;
      setView(v);
    };
    const onEvents = (events: GameEvent[]) => {
      const us = myTeamRef.current;
      for (const ev of events) {
        if (ev.type === 'HAND_STARTED') {
          setDealKey((k) => k + 1);
          sfx.deal();
        }
        if (ev.type === 'CARD_PLAYED') sfx.card();
        if (ev.type === 'TRUCO_CALLED') {
          setBanner(STAKE_SHOUT[ev.proposedStake] ?? 'TRUCO! 🔥');
          sfx.truco();
        }
        if (ev.type === 'TRUCO_ACCEPTED') {
          setBanner(`Aceito! Valendo ${ev.stake}`);
          sfx.accept();
        }
        if (ev.type === 'TRUCO_RUN') {
          setBanner(ev.team === us ? 'Corremos… 🏃' : 'Correram! 🏃');
          sfx.run();
        }
        if (ev.type === 'ROUND_ENDED')
          setBanner(ev.winnerTeam === null ? 'Melou! 🤝' : ev.winnerTeam === us ? 'Rodada nossa! ✨' : 'Rodada deles…');
        if (ev.type === 'HAND_ENDED' && ev.summary.winnerTeam !== null)
          setBanner(
            ev.summary.winnerTeam === us
              ? `+${ev.summary.pointsAwarded} pra nós! 🎉`
              : `+${ev.summary.pointsAwarded} pra eles 😬`,
          );
        if (ev.type === 'MAO_DE_ONZE_ACCEPTED') setBanner('Mão de onze aceita, valendo 3!');
        if (ev.type === 'GAME_ENDED') {
          setBanner(null);
          if (ev.winnerTeam === us) sfx.win();
          else sfx.lose();
        }
      }
    };
    const onChat = (msg: ChatMsg) => {
      setChat((c) => [...c.slice(-99), msg]);
      if (!chatOpenRef.current) setUnread((u) => u + 1);
      sfx.chat();
    };
    const onEmoji = ({ emoji }: { userId: string; emoji: string }) => {
      const id = Date.now() + Math.random();
      setEmojis((list) => [...list.slice(-4), { id, emoji }]);
      setTimeout(() => setEmojis((list) => list.filter((e) => e.id !== id)), 1800);
      sfx.pop();
    };
    const onPlayerDisconnected = () => setBanner('Jogador caiu. 60s pra voltar ⏳');
    const onTurnDeadline = (info: { seat: number; deadline: number }) => setTurnInfo(info);
    const onTurnTimeout = () => setBanner('Tempo esgotado! ⏰');

    socket.on('room:update', onRoom);
    socket.on('game:state', onState);
    socket.on('game:events', onEvents);
    socket.on('chat:message', onChat);
    socket.on('emoji:received', onEmoji);
    socket.on('player:disconnected', onPlayerDisconnected);
    socket.on('turn:deadline', onTurnDeadline);
    socket.on('turn:timeout', onTurnTimeout);

    socket.emit('room:join', { code }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok && res?.error) setError(res.error);
    });

    return () => {
      socket.off('room:update', onRoom);
      socket.off('game:state', onState);
      socket.off('game:events', onEvents);
      socket.off('chat:message', onChat);
      socket.off('emoji:received', onEmoji);
      socket.off('player:disconnected', onPlayerDisconnected);
      socket.off('turn:deadline', onTurnDeadline);
      socket.off('turn:timeout', onTurnTimeout);
    };
  }, [code, router]);

  // Tique do relógio de turno (1s).
  useEffect(() => {
    if (!turnInfo) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [turnInfo]);

  // Pré-jogo: carrega amigos online para o convite direto.
  useEffect(() => {
    if (!room || room.started) return;
    api<{ id: string; displayName: string; online: boolean }[]>('/friends')
      .then((all) => setOnlineFriends(all.filter((f) => f.online)))
      .catch(() => undefined);
  }, [room?.started, room?.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const inviteFriend = (friendId: string, name: string) => {
    getGameSocket().emit(
      'invite:send',
      { toUserId: friendId },
      (res: { ok: boolean; error?: string }) => {
        if (res?.ok) {
          setInvited((s) => new Set([...s, friendId]));
          setNotice(`Convite enviado para ${name}! 🃏`);
        } else {
          setNotice(res?.error ?? 'Falha ao convidar');
        }
      },
    );
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatOpen]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [banner]);

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  const sendAction = useCallback((action: DistributiveOmit<GameAction, 'seat'>) => {
    getGameSocket().emit(
      'game:action',
      { action: { ...action, seat: 0 } }, // o servidor define o assento real
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok && res?.error) setBanner(res.error);
      },
    );
  }, []);

  const playCard = useCallback(
    (index: number) => {
      setSelected(null);
      sendAction({ type: 'PLAY_CARD', cardIndex: index, faceDown: coverMode });
      setCoverMode(false);
    },
    [sendAction, coverMode],
  );

  const setReady = (ready: boolean) => getGameSocket().emit('room:ready', { ready });
  const leave = () => {
    getGameSocket().emit('room:leave');
    router.push('/lobby');
  };
  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    getGameSocket().emit('chat:send', { text });
    setChatInput('');
  };
  const copy = (kind: 'code' | 'link') => {
    const text = kind === 'code' ? code : `${window.location.origin}/mesa/${code}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const toggleSound = () => {
    const next = !soundOff;
    setSoundOff(next);
    setMuted(next);
    if (!next) sfx.accept();
  };

  // -------------------------------------------------------------------------
  // Drag & drop (pointer events: mouse + touch)
  // -------------------------------------------------------------------------

  const hand = view?.hand ?? null;

  // Ding quando vira a minha vez; fora da vez, desarma a carta coberta.
  useEffect(() => {
    const can = !!hand?.canPlay;
    if (can && !prevCanPlayRef.current) sfx.turn();
    if (!can) setCoverMode(false);
    prevCanPlayRef.current = can;
  }, [hand?.canPlay]);

  const pointerInZone = (x: number, y: number) => {
    const rect = dropRef.current?.getBoundingClientRect();
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const onCardPointerDown = (e: React.PointerEvent, index: number) => {
    if (!hand?.canPlay) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ index, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
  };

  const onCardPointerMove = (e: React.PointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8;
      return { ...d, x: e.clientX, y: e.clientY, moved };
    });
    setOverZone(pointerInZone(e.clientX, e.clientY));
  };

  const onCardPointerUp = (e: React.PointerEvent, index: number) => {
    const wasDrag = drag;
    setDrag(null);
    setOverZone(false);
    if (!wasDrag || !hand?.canPlay) return;
    if (wasDrag.moved) {
      if (pointerInZone(e.clientX, e.clientY)) playCard(index);
    } else {
      // Toque/clique simples: 1º seleciona (levanta), 2º joga.
      if (selected === index) playCard(index);
      else setSelected(index);
    }
  };

  // -------------------------------------------------------------------------
  // Derivados
  // -------------------------------------------------------------------------

  const mySeat = view?.seat ?? room?.players.find((p) => p.userId === me?.id)?.seat ?? 0;
  const secondsLeft = turnInfo ? Math.max(0, Math.ceil((turnInfo.deadline - now) / 1000)) : null;
  const clock = secondsLeft !== null ? ` · ${secondsLeft}s` : '';
  const myTeam = mySeat % 2;
  const seatCount = room?.mode === '2v2' ? 4 : 2;
  const gameOver = view !== null && view.winnerTeam !== null;
  const myPlayer = room?.players.find((p) => p.userId === me?.id);
  const opponents = (room?.players ?? [])
    .filter((p) => p.userId !== me?.id)
    .map((p) => ({ ...p, rel: relSeat(p.seat, mySeat, seatCount) }));

  const podPositionClass = (rel: number): string => {
    if (seatCount === 2) return 'left-1/2 top-3 -translate-x-1/2';
    if (rel === 1) return 'right-2 top-1/2 -translate-y-1/2 sm:right-5';
    if (rel === 2) return 'left-1/2 top-3 -translate-x-1/2';
    return 'left-2 top-1/2 -translate-y-1/2 sm:left-5';
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <div className="panel animate-pop-in text-center">
          <p className="text-3xl">🚪</p>
          <p className="mt-2 text-red-400">{error}</p>
          <button onClick={() => router.push('/lobby')} className="btn-secondary mt-5">
            Voltar ao lobby
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* ============================ BARRA SUPERIOR ============================ */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
        <div className="glass flex items-center gap-2 px-3 py-1.5 text-sm">
          <button
            onClick={leave}
            className="px-2 py-1.5 text-zinc-400 transition hover:text-red-400"
            title="Sair da mesa"
            aria-label="Sair da mesa"
          >
            ←
          </button>
          <button
            onClick={() => copy('code')}
            className="font-mono tracking-[0.2em] text-gold transition hover:text-gold-light"
            title="Copiar código"
          >
            {copied === 'code' ? 'copiado ✓' : code}
          </button>
          {room?.ranked && <span title="Ranqueada">🏆</span>}
        </div>

        {view && (
          <div className="glass flex items-center gap-3 px-4 py-1.5 sm:gap-5">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Nós</p>
              <p className="font-display text-2xl leading-none text-zinc-50">{view.scores[myTeam]}</p>
            </div>
            <span className="font-display text-xl text-zinc-600">×</span>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Eles</p>
              <p className="font-display text-2xl leading-none text-zinc-50">{view.scores[1 - myTeam]}</p>
            </div>
            {hand && (
              <span
                className={`rounded-lg px-2.5 py-1 font-display text-sm ${
                  (hand.pendingStake ?? hand.stake) > 1
                    ? 'bg-gradient-to-b from-gold-light to-gold text-zinc-900 shadow-glow'
                    : 'bg-white/10 text-zinc-300'
                }`}
              >
                {hand.pendingStake ?? hand.stake} pts
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="glass flex h-11 w-11 items-center justify-center text-zinc-300 transition hover:text-gold"
            title={soundOff ? 'Ativar som' : 'Silenciar'}
            aria-label={soundOff ? 'Ativar som' : 'Silenciar som'}
          >
            {soundOff ? <IconVolumeOff className="h-5 w-5" /> : <IconVolume className="h-5 w-5" />}
          </button>
          <button
            onClick={() => {
              setChatOpen((o) => !o);
              setUnread(0);
            }}
            className="glass relative flex h-11 w-11 items-center justify-center text-zinc-300 transition hover:text-gold lg:hidden"
            title="Chat"
            aria-label={`Abrir chat${unread > 0 ? ` (${unread} mensagens novas)` : ''}`}
          >
            <IconMessageCircle className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* ============================== MESA ============================== */}
        <section className="relative min-h-0 flex-1 p-2 sm:p-4">
          <div className="table-felt relative h-full w-full rounded-[2.5rem] border-[10px] border-wood shadow-table sm:rounded-[4rem] sm:border-[14px]">
            {/* filete dourado decorativo */}
            <div className="pointer-events-none absolute inset-2 rounded-[2rem] border border-gold/15 sm:inset-3 sm:rounded-[3.4rem]" />

            {/* ------------------- Pré-jogo: aguardando jogadores ------------------- */}
            {!room?.started && (
              <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
                <div className="animate-pop-in text-center">
                  <p className="font-display text-3xl text-zinc-50 sm:text-4xl">
                    Mesa {room?.mode === '2v2' ? '2 x 2' : '1 x 1'}
                  </p>
                  <button
                    onClick={() => copy('code')}
                    className="mt-3 rounded-2xl border border-gold/40 bg-black/30 px-6 py-2 font-mono text-2xl tracking-[0.35em] text-gold transition hover:bg-black/50"
                    title="Copiar código"
                  >
                    {copied === 'code' ? 'COPIADO ✓' : code}
                  </button>
                  <div className="mt-3">
                    <button onClick={() => copy('link')} className="btn-secondary text-sm">
                      {copied === 'link' ? 'Link copiado ✓' : '🔗 Copiar link de convite'}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-zinc-200/60">
                    mande o link, quem abrir cai direto nesta mesa
                  </p>

                  {/* Convite direto para amigos online */}
                  {onlineFriends.filter((f) => !room?.players.some((p) => p.userId === f.id)).length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                        amigos online
                      </p>
                      <div className="mt-2 flex flex-wrap justify-center gap-2">
                        {onlineFriends
                          .filter((f) => !room?.players.some((p) => p.userId === f.id))
                          .slice(0, 6)
                          .map((f) => (
                            <button
                              key={f.id}
                              onClick={() => inviteFriend(f.id, f.displayName)}
                              disabled={invited.has(f.id)}
                              className="btn-secondary px-3 py-1.5 text-sm"
                            >
                              {invited.has(f.id) ? `${f.displayName} ✓` : `+ ${f.displayName}`}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid w-full max-w-sm gap-2">
                  {Array.from({ length: seatCount }).map((_, seat) => {
                    const p = room?.players.find((pl) => pl.seat === seat);
                    return (
                      <div
                        key={seat}
                        className={`glass flex items-center justify-between px-4 py-2.5 ${p ? '' : 'opacity-60'}`}
                      >
                        {p ? (
                          <>
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white
                                  ${p.team === myTeam ? 'bg-gradient-to-b from-emerald-500 to-emerald-700' : 'bg-gradient-to-b from-red-500 to-red-700'}`}
                              >
                                {p.displayName.slice(0, 2).toUpperCase()}
                              </span>
                              <b>{p.displayName}</b>
                            </span>
                            <span className={p.ready ? 'text-emerald-400' : 'animate-pulse text-zinc-500'}>
                              {p.ready ? 'pronto ✓' : 'esperando…'}
                            </span>
                          </>
                        ) : (
                          <span className="flex items-center gap-2.5 text-zinc-400">
                            <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full border border-dashed border-zinc-500">
                              ?
                            </span>
                            vaga aberta
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setReady(!myPlayer?.ready)}
                  className={myPlayer?.ready ? 'btn-secondary px-10 py-3' : 'btn-primary animate-pulse-gold px-10 py-3 text-lg'}
                >
                  {myPlayer?.ready ? 'Cancelar' : 'Estou pronto!'}
                </button>
              </div>
            )}

            {/* ----------------------------- Em jogo ----------------------------- */}
            {room?.started && hand && (
              <>
                {/* Monte + vira no canto da mesa (não sobrepõe pods nem centro) */}
                <div className="absolute left-3 top-3 z-10 flex scale-90 flex-col items-center gap-1 sm:left-6 sm:top-6 sm:scale-100">
                  <div className="relative">
                    <CardBack size="sm" className="absolute -left-1 -top-1 -rotate-6" />
                    <CardBack size="sm" className="absolute -left-0.5 -top-0.5 -rotate-3" />
                    <ViraFlip key={`${hand.vira.rank}${hand.vira.suit}`} card={hand.vira} />
                  </div>
                  <span className="glass px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                    manilha {manilhaRank(hand.vira)}
                  </span>
                </div>

                {/* Adversários / parceiro */}
                {opponents.map((p) => {
                  const isTurn = hand.currentTurnSeat === p.seat;
                  const sameTeam = p.team === myTeam;
                  return (
                    <div
                      key={p.userId}
                      className={`absolute z-10 flex flex-col items-center gap-1.5 ${podPositionClass(p.rel)} ${!p.connected ? 'opacity-50' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-black text-white shadow-lg transition
                            ${sameTeam ? 'bg-gradient-to-b from-emerald-500 to-emerald-700' : 'bg-gradient-to-b from-red-500 to-red-700'}
                            ${isTurn ? 'animate-pulse-ring' : ''}`}
                        >
                          {p.displayName.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="glass max-w-28 truncate px-2 py-0.5 text-xs font-semibold">
                          {p.displayName}
                          {!p.connected && ' ⏳'}
                        </span>
                      </div>
                      <div className="flex">
                        {Array.from({ length: hand.handCounts[p.seat] ?? 0 }).map((_, i) => (
                          <CardBack
                            key={i}
                            size="sm"
                            className="-mx-1.5 first:ml-0"
                            style={{ transform: `rotate(${(i - 1) * 7}deg) translateY(${Math.abs(i - 1) * 2}px)` }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Centro: vira + monte + zona de jogo + cartas na mesa */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  {/* Zona de soltar (drag & drop) */}
                  <div
                    ref={dropRef}
                    className={`absolute left-1/2 top-1/2 h-48 w-64 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-2 transition-all duration-200 sm:h-56 sm:w-80
                      ${drag?.moved
                        ? overZone
                          ? 'scale-105 border-dashed border-gold bg-gold/15 shadow-glow'
                          : 'border-dashed border-gold/50 bg-black/10'
                        : 'border-transparent'}`}
                  >
                    {drag?.moved && (
                      <span className="absolute inset-0 flex items-center justify-center text-center font-display text-lg italic text-gold/80">
                        {overZone ? (coverMode ? 'solta, vai coberta 🂠' : 'solta!') : 'arrasta até aqui'}
                      </span>
                    )}
                  </div>

                  {/* Cartas jogadas nesta rodada */}
                  {hand.table.map((p) => {
                    const off = playedOffset(relSeat(p.seat, mySeat, seatCount), seatCount);
                    return (
                      <div
                        key={`${p.seat}-${p.card?.rank ?? 'x'}-${p.card?.suit ?? 'x'}`}
                        className="absolute left-1/2 top-1/2 animate-deal-in"
                        style={{
                          transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) rotate(${off.r}deg)`,
                        }}
                      >
                        <div className="relative">
                          <PlayingCard
                            card={p.card}
                            faceDown={p.faceDown && p.card === null}
                            manilha={p.card && !p.faceDown ? isManilha(p.card, hand.vira) : false}
                          />
                          {/* Sua própria carta coberta: você vê a face, com o selo */}
                          {p.faceDown && p.card && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                              coberta
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                </div>

                {/* ------------------------- Minha área ------------------------- */}
                <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 pb-3">
                  {/* Barra de ações: rodadas · truco · coberta · status */}
                  <div className="flex min-h-11 flex-wrap items-center justify-center gap-2 px-3 sm:gap-3">
                    <div className="flex gap-1.5" title="Rodadas da mão">
                      {[0, 1, 2].map((i) => {
                        const r = hand.roundResults[i];
                        const done = i < hand.roundResults.length;
                        return (
                          <span
                            key={i}
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-black shadow transition
                              ${!done
                                ? i === hand.roundResults.length
                                  ? 'border-gold/60 bg-black/30 text-gold/70'
                                  : 'border-white/15 bg-black/20 text-transparent'
                                : r === null
                                  ? 'border-zinc-400 bg-zinc-600 text-white'
                                  : r === myTeam
                                    ? 'border-emerald-300 bg-emerald-600 text-white'
                                    : 'border-red-300 bg-red-600 text-white'}`}
                          >
                            {done ? (r === null ? '=' : r === myTeam ? '✓' : '✗') : i + 1}
                          </span>
                        );
                      })}
                    </div>

                    {hand.canCallTruco && (
                      <button onClick={() => sendAction({ type: 'CALL_TRUCO' })} className="btn-truco">
                        {STAKE_LABEL[hand.stake] ?? 'TRUCO'}!
                      </button>
                    )}

                    {/* Carta coberta: permitida a partir da 2ª rodada */}
                    {hand.canPlay && hand.roundResults.length > 0 && (
                      <button
                        onClick={() => setCoverMode((m) => !m)}
                        className={
                          coverMode
                            ? 'btn rounded-full border-2 border-gold bg-gold/20 px-4 py-1.5 text-sm font-bold text-gold shadow-glow'
                            : 'btn-secondary px-4 py-1.5 text-sm'
                        }
                        title="Jogar a próxima carta virada para baixo"
                      >
                        🂠 {coverMode ? 'Vai coberta' : 'Jogar coberta'}
                      </button>
                    )}

                    {hand.phase === 'playing' && !hand.canPlay && (
                      <span className="glass px-4 py-1.5 text-sm text-zinc-300">aguardando a vez…{clock}</span>
                    )}
                    {hand.canPlay && (
                      <span
                        className={`glass animate-pop-in px-4 py-1.5 text-sm font-bold ${
                          secondsLeft !== null && secondsLeft <= 10 ? 'text-red-400' : 'text-gold'
                        }`}
                      >
                        {coverMode ? 'sua vez, ela cai virada 🂠' : 'sua vez 👆'}
                        {clock}
                      </span>
                    )}
                  </div>

                  {/* Leque de cartas (re-anima a cada mão via dealKey) */}
                  <div key={dealKey} className="flex items-end px-4 pt-3">
                    {hand.myCards.map((card, i) => {
                      const n = hand.myCards.length;
                      const angle = n === 1 ? 0 : (i - (n - 1) / 2) * 8;
                      const lift = Math.abs(angle) * 1.2;
                      const isSel = selected === i;
                      const isDragging = drag?.index === i && drag.moved;
                      return (
                        <div
                          key={`${card.rank}-${card.suit}`}
                          onPointerDown={(e) => onCardPointerDown(e, i)}
                          onPointerMove={onCardPointerMove}
                          onPointerUp={(e) => onCardPointerUp(e, i)}
                          className={`relative -mx-2.5 transition-transform duration-200 sm:-mx-2
                            ${hand.canPlay ? 'cursor-grab active:cursor-grabbing' : ''}
                            ${isDragging ? 'opacity-25' : ''}`}
                          style={{
                            transform: `rotate(${angle}deg) translateY(${lift + (isSel ? -26 : 0)}px)`,
                            touchAction: 'none',
                            zIndex: isSel ? 5 : 1,
                          }}
                        >
                          <PlayingCard
                            card={card}
                            size="lg"
                            manilha={isManilha(card, hand.vira)}
                            selected={isSel}
                            dimmed={!hand.canPlay}
                            className="animate-deal-in [animation-fill-mode:backwards]"
                            style={{ animationDelay: `${0.1 + i * 0.13}s` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---------------- Decisões: truco / mão de onze ---------------- */}
                {hand.canRespondTruco && (
                  <div className="absolute left-1/2 top-[40%] z-30 w-[min(92%,26rem)] -translate-x-1/2 -translate-y-1/2 animate-pop-in">
                    <div className="glass border-gold/30 p-5 text-center shadow-glow">
                      <p className="font-display text-2xl text-gold">
                        Pediram {hand.pendingStake}! E agora?{hand.canRespondTruco ? clock : ''}
                      </p>
                      <div className="mt-4 flex justify-center gap-3">
                        <button
                          onClick={() => sendAction({ type: 'RESPOND_TRUCO', response: 'accept' })}
                          className="btn-primary"
                        >
                          Aceitar
                        </button>
                        {hand.pendingStake !== 12 && (
                          <button
                            onClick={() => sendAction({ type: 'RESPOND_TRUCO', response: 'raise' })}
                            className="btn-danger"
                          >
                            {STAKE_LABEL[hand.pendingStake ?? 3] ?? 'Aumentar'}!
                          </button>
                        )}
                        <button
                          onClick={() => sendAction({ type: 'RESPOND_TRUCO', response: 'run' })}
                          className="btn-secondary"
                        >
                          Correr
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {hand.canDecideMaoDeOnze && (
                  <div className="absolute left-1/2 top-[40%] z-30 w-[min(92%,28rem)] -translate-x-1/2 -translate-y-1/2 animate-pop-in">
                    <div className="glass border-gold/30 p-5 text-center shadow-glow">
                      <p className="font-display text-2xl text-gold">Mão de onze!</p>
                      <p className="mt-1 text-sm text-zinc-300">Jogar valendo 3 ou correr e dar 1 pra eles?</p>
                      {hand.partnerCards && (
                        <div className="mt-3 flex justify-center gap-1.5">
                          {hand.partnerCards.map((c, i) => (
                            <PlayingCard key={i} card={c} size="sm" manilha={isManilha(c, hand.vira)} />
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex justify-center gap-3">
                        <button
                          onClick={() => sendAction({ type: 'MAO_DE_ONZE_DECISION', play: true })}
                          className="btn-primary"
                        >
                          Jogar!
                        </button>
                        <button
                          onClick={() => sendAction({ type: 'MAO_DE_ONZE_DECISION', play: false })}
                          className="btn-secondary"
                        >
                          Correr
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Banner central de eventos (quebra linha, nunca estoura a mesa) */}
            {banner && (
              <div className="pointer-events-none absolute inset-x-0 top-[14%] z-40 flex justify-center px-8">
                <p className="animate-pop-in max-w-full rounded-2xl border border-gold/25 bg-black/75 px-6 py-2.5 text-center font-display text-2xl italic leading-tight text-gold shadow-glow backdrop-blur-sm sm:text-4xl">
                  {banner}
                </p>
              </div>
            )}

            {/* Emojis flutuantes */}
            <div className="pointer-events-none absolute right-8 top-1/3 z-40">
              {emojis.map((e) => (
                <span key={e.id} className="absolute animate-float-up text-5xl">
                  {e.emoji}
                </span>
              ))}
            </div>
          </div>

          {/* Ghost da carta arrastada */}
          {drag?.moved && hand?.myCards[drag.index] && (
            <div
              className="pointer-events-none fixed z-50"
              style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -70%) rotate(5deg) scale(1.12)' }}
            >
              {coverMode ? (
                <CardBack size="lg" className="drop-shadow-2xl" />
              ) : (
                <PlayingCard
                  card={hand.myCards[drag.index]!}
                  size="lg"
                  manilha={isManilha(hand.myCards[drag.index]!, hand.vira)}
                  className="drop-shadow-2xl"
                />
              )}
            </div>
          )}
        </section>

        {/* ============================== CHAT ============================== */}
        <aside
          className={`fixed inset-x-0 bottom-0 z-40 flex h-80 flex-col rounded-t-3xl border-t border-white/10 bg-black/80 backdrop-blur-xl transition-transform duration-300
            lg:static lg:h-auto lg:w-80 lg:translate-y-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-black/40
            ${chatOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <h3 className="flex items-center gap-2 font-bold text-zinc-300">
              <IconMessageCircle className="h-4 w-4" /> Mesa
            </h3>
            <button
              onClick={() => setChatOpen(false)}
              className="flex h-9 w-9 items-center justify-center text-zinc-500 hover:text-zinc-300 lg:hidden"
              aria-label="Fechar chat"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-2 text-sm">
            {chat.length === 0 && <p className="pt-4 text-center text-zinc-600">Solta o papo… 🎙️</p>}
            {chat.map((m) => (
              <p key={m.id} className="leading-snug">
                <b className={m.userId === me?.id ? 'text-gold' : 'text-emerald-400'}>{m.username}</b>{' '}
                <span className="text-zinc-200">{m.text}</span>
              </p>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex justify-around px-2 pb-1">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => getGameSocket().emit('emoji:send', { emoji: e })}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl transition hover:bg-white/10"
                aria-label={`Enviar reação ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <form onSubmit={sendChat} className="flex gap-2 border-t border-white/10 p-3">
            <input
              className="input min-h-11 flex-1 py-1.5"
              placeholder="Mensagem…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={200}
              aria-label="Mensagem para a mesa"
            />
            <button className="btn-primary min-h-11 px-4" aria-label="Enviar mensagem">
              <IconSend className="h-4 w-4" />
            </button>
          </form>
        </aside>
      </div>

      {/* ============================ FIM DE JOGO ============================ */}
      {gameOver && view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="animate-pop-in w-full max-w-sm rounded-3xl border border-gold/30 bg-gradient-to-b from-zinc-900 to-black p-8 text-center shadow-glow">
            <p className="text-6xl">{view.winnerTeam === myTeam ? '🏆' : '😮‍💨'}</p>
            <h2 className="mt-3 font-display text-4xl text-gold">
              {view.winnerTeam === myTeam ? 'Vitória!' : 'Derrota'}
            </h2>
            <p className="mt-2 font-display text-2xl text-zinc-300">
              {view.scores[myTeam]} × {view.scores[1 - myTeam]}
            </p>
            {room?.seriesScore && (room.seriesScore[0] + room.seriesScore[1] > 1 || (room.rematchVotes?.length ?? 0) > 0) && (
              <p className="mt-1 text-sm text-zinc-500">
                Série: {room.seriesScore[myTeam]} × {room.seriesScore[1 - myTeam]}
              </p>
            )}
            <div className="mt-6 grid gap-2">
              <button
                onClick={() => getGameSocket().emit('room:rematch')}
                disabled={room?.rematchVotes?.includes(me?.id ?? '')}
                className="btn-primary w-full py-3"
              >
                {room?.rematchVotes?.includes(me?.id ?? '')
                  ? `Aguardando os outros… (${room?.rematchVotes?.length ?? 0}/${room?.players.length ?? 0})`
                  : `Revanche${(room?.rematchVotes?.length ?? 0) > 0 ? ` (${room?.rematchVotes?.length}/${room?.players.length})` : ''}`}
              </button>
              <button onClick={leave} className="btn-secondary w-full py-3">
                Voltar ao lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
