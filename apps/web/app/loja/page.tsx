'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

interface StoreItem {
  id: string;
  type: string;
  name: string;
  description: string | null;
  priceCoins: number;
  rarity: string;
}

const TYPE_LABEL: Record<string, string> = {
  AVATAR: 'Avatares',
  PROFILE_FRAME: 'Molduras',
  TABLE_THEME: 'Temas de mesa',
  CARD_BACK: 'Versos de carta',
  EMOJI_PACK: 'Emojis',
  VISUAL_EFFECT: 'Efeitos',
};

const PREMIUM_PLANS = [
  { plan: 'MONTHLY', label: 'Mensal', price: 'R$ 9,90/mês' },
  { plan: 'YEARLY', label: 'Anual', price: 'R$ 79,90/ano' },
  { plan: 'LIFETIME', label: 'Vitalício', price: 'R$ 149,90 (única vez)' },
] as const;

export default function LojaPage() {
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<StoreItem[]>('/store/items', { auth: false }).then(setItems).catch(() => undefined);
    if (useAuth.getState().accessToken) {
      api<{ itemId: string }[]>('/store/my-items')
        .then((mine) => setOwned(new Set(mine.map((m) => m.itemId))))
        .catch(() => undefined);
    }
  }, []);

  const buy = async (item: StoreItem) => {
    try {
      await api(`/store/items/${item.id}/purchase`, { method: 'POST' });
      setOwned((o) => new Set([...o, item.id]));
      setMessage(`✅ ${item.name} adquirido!`);
    } catch (err) {
      setMessage(err instanceof Error ? `⚠ ${err.message}` : 'Erro na compra');
    }
  };

  const groups = items.reduce<Record<string, StoreItem[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-black">🛍️ Loja</h1>
        <p className="mt-1 text-zinc-400">
          Tudo aqui é cosmético. <b>Nada</b> dá vantagem em jogo.
        </p>
        {message && <p className="mt-4 rounded-xl bg-black/40 p-3">{message}</p>}

        {/* Premium */}
        <section className="panel mt-8 border-gold/40">
          <h2 className="text-xl font-bold text-gold">★ Premium, zero anúncios</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-zinc-300">
            <li>Zero anúncios, em qualquer situação</li>
            <li>Selo ★ no perfil</li>
            <li>Estatísticas avançadas e histórico detalhado</li>
          </ul>
          {user?.isPremium ? (
            <p className="mt-4 font-bold text-gold">Você já é Premium. Obrigado! 💛</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PREMIUM_PLANS.map((p) => (
                <div key={p.plan} className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
                  <p className="font-bold">{p.label}</p>
                  <p className="mt-1 text-sm text-zinc-400">{p.price}</p>
                  <button className="btn-primary mt-3 w-full text-sm" disabled title="Pagamentos em breve">
                    Em breve
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cosméticos */}
        {Object.entries(groups).map(([type, list]) => (
          <section key={type} className="mt-8">
            <h2 className="text-xl font-bold">{TYPE_LABEL[type] ?? type}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              {list.map((item) => (
                <div key={item.id} className="panel">
                  <p className="font-bold">{item.name}</p>
                  {item.description && <p className="mt-1 text-sm text-zinc-400">{item.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-gold">🪙 {item.priceCoins}</span>
                    {owned.has(item.id) ? (
                      <span className="text-sm text-green-400">Adquirido ✔</span>
                    ) : (
                      <button onClick={() => buy(item)} className="btn-secondary text-sm">
                        Comprar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {items.length === 0 && (
          <p className="mt-8 text-zinc-500">Itens cosméticos chegam em breve. 🎨</p>
        )}
      </main>
    </>
  );
}
