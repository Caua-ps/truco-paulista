'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { useSocial } from '@/lib/social-store';
import { disconnectGameSocket } from '@/lib/socket';

export function Navbar() {
  const { user, clear } = useAuth();
  const unreadTotal = useSocial((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const router = useRouter();

  const logout = () => {
    disconnectGameSocket();
    clear();
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/[0.06] bg-black/40 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href={user ? '/lobby' : '/'}
          className="flex items-baseline gap-2 font-display text-xl text-zinc-50 transition hover:text-gold-light"
        >
          <span className="text-gold">♠</span>
          Truco <em className="text-gold">Paulista</em>
        </Link>

        <div className="flex items-center gap-1 text-sm sm:gap-2">
          {user ? (
            <>
              <Link
                href="/amigos"
                className="relative hidden rounded-full px-3 py-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-gold sm:block"
              >
                Amigos
                {unreadTotal > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadTotal > 9 ? '9+' : unreadTotal}
                  </span>
                )}
              </Link>
              <Link
                href="/ranking"
                className="hidden rounded-full px-3 py-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-gold sm:block"
              >
                Ranking
              </Link>
              <Link
                href="/loja"
                className="hidden rounded-full px-3 py-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-gold sm:block"
              >
                Loja
              </Link>
              <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
              <Link
                href="/perfil"
                className="flex items-center gap-2.5 rounded-full px-2 py-1 text-zinc-200 transition hover:bg-white/5 hover:text-gold"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-felt-light to-felt-dark text-xs font-bold text-white ring-1 ring-white/20">
                  {user.displayName.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden sm:block">
                  {user.displayName}
                  {user.isPremium && <span className="ml-1 text-gold" title="Premium">★</span>}
                </span>
              </Link>
              <button
                onClick={logout}
                className="rounded-full px-3 py-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-1.5 text-zinc-300 transition hover:bg-white/5 hover:text-gold"
              >
                Entrar
              </Link>
              <Link href="/cadastro" className="btn-primary px-5 py-1.5 text-sm">
                Criar conta
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
