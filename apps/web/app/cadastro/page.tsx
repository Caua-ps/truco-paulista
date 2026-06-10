'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';
import { SessionUser, useAuth } from '@/lib/auth-store';

function CadastroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next?.startsWith('/') ? next : '/lobby';
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<{ user: SessionUser; tokens: { accessToken: string; refreshToken: string } }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify(form), auth: false },
      );
      setSession(result.tokens, result.user);
      router.push(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no cadastro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel animate-pop-in">
      <h1 className="font-display text-3xl text-zinc-50">Criar conta</h1>
      {next ? (
        <p className="mt-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">
          🃏 Crie a conta e caia direto na mesa do convite.
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-400">Grátis. Você recebe um e-mail de confirmação.</p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="input"
          placeholder="Nome de usuário (3–20, letras/números/_)"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          required
        />
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Senha (mínimo 8 caracteres)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-400">
        Já tem conta?{' '}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="text-gold hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}

export default function CadastroPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-md flex-col px-4 py-16">
        <Suspense>
          <CadastroForm />
        </Suspense>
      </main>
    </>
  );
}
