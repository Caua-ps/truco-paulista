'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';

function VerificarEmail() {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    api('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
      auth: false,
    })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="panel text-center">
      {status === 'loading' && <p className="text-zinc-300">Verificando…</p>}
      {status === 'ok' && (
        <>
          <p className="text-2xl">✅</p>
          <h1 className="mt-2 text-xl font-bold">E-mail verificado!</h1>
          <a href="/lobby" className="btn-primary mt-6">
            Ir para o lobby
          </a>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-2xl">⚠️</p>
          <h1 className="mt-2 text-xl font-bold">Link inválido ou expirado</h1>
          <a href="/login" className="btn-secondary mt-6">
            Voltar
          </a>
        </>
      )}
    </div>
  );
}

export default function VerificarEmailPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-16">
        <Suspense>
          <VerificarEmail />
        </Suspense>
      </main>
    </>
  );
}
