'use client';

import { create } from 'zustand';

export interface PendingInvite {
  fromUserId: string;
  fromName: string;
  code: string;
  mode: '1v1' | '2v2';
  ranked: boolean;
  at: number;
}

export interface DirectMessage {
  id: string;
  fromUserId: string;
  toUserId?: string;
  fromUsername?: string;
  text: string;
  at: number;
}

interface SocialState {
  /** Mensagens não lidas por amigo (friendId → quantidade). */
  unread: Record<string, number>;
  /** Conversa aberta no momento (não acumula não-lidas). */
  activeChat: string | null;
  /** Convite de mesa pendente (toast global). */
  invite: PendingInvite | null;
  /** Aviso passageiro (ex.: convite recusado). */
  notice: string | null;
  setUnread: (map: Record<string, number>) => void;
  bumpUnread: (friendId: string) => void;
  clearUnread: (friendId: string) => void;
  setActiveChat: (friendId: string | null) => void;
  setInvite: (invite: PendingInvite | null) => void;
  setNotice: (notice: string | null) => void;
}

export const useSocial = create<SocialState>((set) => ({
  unread: {},
  activeChat: null,
  invite: null,
  notice: null,
  setUnread: (unread) => set({ unread }),
  bumpUnread: (friendId) =>
    set((s) => ({ unread: { ...s.unread, [friendId]: (s.unread[friendId] ?? 0) + 1 } })),
  clearUnread: (friendId) =>
    set((s) => {
      const { [friendId]: _gone, ...rest } = s.unread;
      return { unread: rest };
    }),
  setActiveChat: (activeChat) => set({ activeChat }),
  setInvite: (invite) => set({ invite }),
  setNotice: (notice) => set({ notice }),
}));
