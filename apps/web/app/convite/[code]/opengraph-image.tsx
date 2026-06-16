import { ImageResponse } from 'next/og';

export const alt = 'Convite para uma mesa de Truco Paulista';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Imagem de preview do link (WhatsApp, Telegram, X, etc.). */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let host: string | null = null;
  let mode = '';
  try {
    const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(code)}/preview`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const p = await res.json();
      host = p?.host?.displayName ?? null;
      mode = p?.mode === '2v2' ? 'Dupla 2x2' : p?.mode === '1v1' ? 'Mano a mano 1x1' : '';
    }
  } catch {
    /* preview indisponível — cai no card genérico */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0c1410 0%, #13301f 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 8, color: '#d4af37', fontWeight: 700 }}>
          TRUCO PAULISTA
        </div>
        <div style={{ fontSize: 96, margin: '8px 0 16px' }}>🃏</div>
        <div style={{ fontSize: 58, fontWeight: 800, textAlign: 'center', padding: '0 60px' }}>
          {host ? `${host} te chamou para a mesa` : 'Você foi convidado para uma mesa'}
        </div>
        <div style={{ marginTop: 22, fontSize: 34, color: '#9fb3a6' }}>
          {mode ? `${mode} • entre e jogue agora` : 'Entre e jogue Truco em tempo real'}
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 40,
            letterSpacing: 14,
            color: '#d4af37',
            border: '2px solid rgba(212,175,55,0.5)',
            borderRadius: 18,
            padding: '12px 34px',
          }}
        >
          {code.toUpperCase()}
        </div>
      </div>
    ),
    size,
  );
}
