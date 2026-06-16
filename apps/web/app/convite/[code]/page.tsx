import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface RoomPreview {
  found: boolean;
  code?: string;
  mode?: '1v1' | '2v2';
  ranked?: boolean;
  started?: boolean;
  players?: number;
  max?: number;
  full?: boolean;
  host?: { displayName: string; username: string; avatarUrl: string | null } | null;
}

/** Busca a prévia pública da sala (sem auth). Falha silenciosa → sala genérica. */
async function fetchPreview(code: string): Promise<RoomPreview> {
  try {
    const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(code)}/preview`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { found: false };
    return (await res.json()) as RoomPreview;
  } catch {
    return { found: false };
  }
}

const modeLabel = (mode?: string) => (mode === '2v2' ? 'Dupla (2x2)' : 'Mano a mano (1x1)');

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const preview = await fetchPreview(code);
  const host = preview.host?.displayName;
  const title = host
    ? `${host} te chamou para uma mesa de Truco`
    : 'Convite para uma mesa de Truco Paulista';
  const description = preview.found
    ? `${modeLabel(preview.mode)}${preview.ranked ? ' • Ranqueada' : ''} • ${preview.players}/${preview.max} jogadores. Entre e sente à mesa!`
    : 'Toque para entrar na mesa e jogar Truco Paulista em tempo real.';

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  const preview = await fetchPreview(normalized);

  // Código com formato inválido: não existe sala possível.
  if (!/^[A-Z0-9]{6}$/.test(normalized)) notFound();

  const host = preview.host?.displayName;
  const unavailable = preview.found && (preview.started || preview.full);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="panel animate-pop-in w-full max-w-md text-center">
        <div className="text-sm font-bold uppercase tracking-[0.2em] text-gold">Truco Paulista</div>

        <div className="mx-auto my-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/40 bg-black/30 text-4xl">
          🃏
        </div>

        <h1 className="font-display text-2xl text-zinc-50">
          {host ? `${host} te chamou para a mesa` : 'Você foi convidado para uma mesa'}
        </h1>

        {preview.found ? (
          <p className="mt-3 text-zinc-300">
            {modeLabel(preview.mode)}
            {preview.ranked ? ' • Ranqueada' : ''}
            <br />
            <span className="text-zinc-400">
              {preview.players}/{preview.max} jogadores
            </span>
          </p>
        ) : (
          <p className="mt-3 text-zinc-400">
            Não encontramos esta mesa agora — ela pode ter sido fechada. Tente o código abaixo
            mesmo assim ou peça um convite novo.
          </p>
        )}

        <div className="mt-4 inline-block rounded-xl border border-gold/40 bg-black/30 px-5 py-2 font-mono text-xl tracking-[0.3em] text-gold">
          {normalized}
        </div>

        <div className="mt-7">
          {unavailable ? (
            <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {preview.started ? 'A partida já começou.' : 'A mesa está cheia.'} Peça outro convite.
            </p>
          ) : (
            <Link href={`/mesa/${normalized}`} className="btn-primary inline-block px-10 py-3 text-lg">
              Entrar na mesa
            </Link>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            Sem conta?{' '}
            <Link href={`/cadastro?next=/mesa/${normalized}`} className="text-gold hover:underline">
              Crie a sua em segundos
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
