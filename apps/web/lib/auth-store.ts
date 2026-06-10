'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  level: number;
  rating: number;
  xp: number;
  emailVerified: boolean;
  isPremium: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  setSession: (tokens: { accessToken: string; refreshToken: string }, user?: SessionUser) => void;
  setUser: (user: SessionUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (tokens, user) =>
        set((s) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: user ?? s.user,
        })),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'truco-auth' },
  ),
);
