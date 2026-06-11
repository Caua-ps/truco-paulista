import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { SocialProvider } from '@/components/SocialProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const playfair = Playfair_Display({
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Truco Paulista Online',
  description: 'Jogue Truco Paulista multiplayer em tempo real: 1x1, 2x2, ranqueadas e salas privadas.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Truco Paulista' },
};

export const viewport: Viewport = {
  themeColor: '#1a6b3c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${playfair.variable} font-sans`}>
        {children}
        <SocialProvider />
      </body>
    </html>
  );
}
