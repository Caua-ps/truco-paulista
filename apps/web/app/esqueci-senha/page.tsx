'use client';

import { FormEvent, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      auth: false,
    }).catch(() => undefined);
    setSent(true); // resposta idêntica sempre — não revela se o e-mail existe
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="panel">
          <h1 className="text-2xl font-black">Recuperar senha</h1>
          {sent ? (
            <p className="mt-4 text-zinc-300">
              Se este e-mail estiver cadastrado, você receberá um link de redefinição em instantes.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <input
                className="input"
                type="email"
                placeholder="Seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button className="btn-primary w-full">Enviar link</button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
