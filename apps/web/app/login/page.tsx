'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api, API_URL } from '@/lib/api';
import { SessionUser, useAuth } from '@/lib/auth-store';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next?.startsWith('/') ? next : '/lobby';
  const setSession = useAuth((s) => s.setSession);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<{ user: SessionUser; tokens: { accessToken: string; refreshToken: string } }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ identifier, password }), auth: false },
      );
      setSession(result.tokens, result.user);
      router.push(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel animate-pop-in">
      <h1 className="font-display text-3xl text-zinc-50">Entrar</h1>
      {next && (
        <p className="mt-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">
          🃏 Você foi convidado para uma mesa — entre para sentar.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="input"
          placeholder="Usuário ou e-mail"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <a href={`${API_URL}/auth/google`} className="btn-secondary mt-4 w-full">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.66l3.12-3.12C17.46 1.8 14.96.75 12 .75 7.31.75 3.26 3.44 1.28 7.35l3.64 2.82C5.87 7.24 8.69 5.04 12 5.04z"/>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.45c-.28 1.48-1.12 2.74-2.39 3.58l3.68 2.85c2.15-1.99 3.75-4.92 3.75-8.67z"/>
          <path fill="#FBBC05" d="M4.92 14.41a7.06 7.06 0 0 1 0-4.51L1.28 7.08a11.26 11.26 0 0 0 0 10.11l3.64-2.78z"/>
          <path fill="#34A853" d="M12 23.25c3.04 0 5.59-1 7.45-2.72l-3.68-2.85c-1.02.69-2.33 1.1-3.77 1.1-3.31 0-6.13-2.2-7.08-5.18l-3.64 2.81c1.98 3.92 6.03 6.84 10.72 6.84z"/>
        </svg>
        Entrar com Google
      </a>

      <div className="mt-6 flex justify-between text-sm text-zinc-400">
        <Link href="/esqueci-senha" className="hover:text-gold">
          Esqueci a senha
        </Link>
        <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : '/cadastro'} className="hover:text-gold">
          Criar conta
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-md flex-col px-4 py-16">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
