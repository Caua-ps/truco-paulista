'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { DirectMessage, useSocial } from '@/lib/social-store';
import { getGameSocket } from '@/lib/socket';
import { sfx } from '@/lib/sound';

/**
 * Camada social global: escuta DMs e convites de mesa em qualquer página
 * e exibe o toast de convite. Montado uma vez no layout raiz.
 */
export function SocialProvider() {
  const router = useRouter();
  const token = useAuth((s) => s.accessToken);
  const { invite, notice, setInvite, setNotice } = useSocial();

  useEffect(() => {
    if (!token) return;
    const socket = getGameSocket();

    const onDm = (msg: DirectMessage) => {
      const me = useAuth.getState().user;
      const { activeChat, bumpUnread } = useSocial.getState();
      if (msg.fromUserId !== me?.id && msg.fromUserId !== activeChat) {
        bumpUnread(msg.fromUserId);
        sfx.chat();
      }
    };
    const onInvite = (data: Omit<NonNullable<typeof invite>, 'at'>) => {
      useSocial.getState().setInvite({ ...data, at: Date.now() });
      sfx.turn();
    };
    const onDeclined = (data: { byUsername: string }) => {
      useSocial.getState().setNotice(`@${data.byUsername} recusou o convite 😕`);
    };

    socket.on('dm:message', onDm);
    socket.on('invite:received', onInvite);
    socket.on('invite:declined', onDeclined);

    // Contadores de não-lidas ao entrar.
    api<Record<string, number>>('/friends/messages/unread')
      .then((map) => useSocial.getState().setUnread(map))
      .catch(() => undefined);

    return () => {
      socket.off('dm:message', onDm);
      socket.off('invite:received', onInvite);
      socket.off('invite:declined', onDeclined);
    };
  }, [token]);

  // Convite expira sozinho em 30s; aviso some em 4s.
  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(() => setInvite(null), 30_000);
    return () => clearTimeout(t);
  }, [invite, setInvite]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4_000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  const accept = () => {
    if (!invite) return;
    setInvite(null);
    router.push(`/mesa/${invite.code}`);
  };

  const decline = () => {
    if (!invite) return;
    getGameSocket().emit('invite:decline', { toUserId: invite.fromUserId });
    setInvite(null);
  };

  return (
    <>
      {invite && (
        <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,22rem)] animate-pop-in">
          <div className="glass border-gold/40 p-4 shadow-glow">
            <p className="text-sm text-zinc-300">
              🃏 <b className="text-gold">{invite.fromName}</b> te chamou para uma mesa{' '}
              <b>{invite.mode === '2v2' ? '2x2' : '1x1'}</b>
              {invite.ranked && ' ranqueada'}!
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={accept} className="btn-primary flex-1 py-1.5 text-sm">
                Sentar na mesa
              </button>
              <button onClick={decline} className="btn-secondary py-1.5 text-sm">
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="fixed bottom-4 right-4 z-[60] animate-pop-in">
          <p className="glass px-4 py-2.5 text-sm text-zinc-200">{notice}</p>
        </div>
      )}
    </>
  );
}
