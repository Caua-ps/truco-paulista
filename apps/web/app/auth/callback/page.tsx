'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SessionUser, useAuth } from '@/lib/auth-store';

/**
 * Destino do redirect do Google OAuth. Os tokens chegam no fragment (#) da URL,
 * que nunca é enviado a servidor algum.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { setSession, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    if (!accessToken || !refreshToken) {
      setError('Login com Google falhou. Tente novamente.');
      return;
    }
    setSession({ accessToken, refreshToken });
    window.history.replaceState(null, '', '/auth/callback');
    api<SessionUser & { stats: unknown }>('/users/me')
      .then((me) => {
        setUser(me);
        router.replace('/lobby');
      })
      .catch(() => setError('Não foi possível carregar seu perfil.'));
  }, [router, setSession, setUser]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <div className="panel text-center">
        {error ? (
          <>
            <p className="text-red-400">{error}</p>
            <a href="/login" className="btn-secondary mt-4">
              Voltar ao login
            </a>
          </>
        ) : (
          <p className="text-zinc-300">Entrando com Google…</p>
        )}
      </div>
    </main>
  );
}
