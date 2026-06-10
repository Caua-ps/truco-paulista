'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';

function RedefinirSenhaForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        auth: false,
      });
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token inválido');
    }
  };

  return (
    <div className="panel">
      <h1 className="text-2xl font-black">Nova senha</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="input"
          type="password"
          placeholder="Nova senha (mínimo 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full">Redefinir</button>
      </form>
    </div>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-16">
        <Suspense>
          <RedefinirSenhaForm />
        </Suspense>
      </main>
    </>
  );
}
