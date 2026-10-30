import type { Metadata, Viewport } from 'next';
import { AuthGate } from '@/components/AuthGate';
import PwaRegister from '@/components/PwaRegister';
import { StreamProvider } from '@/context/StreamContext';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Co Stream — Your cinema, together',
  description: 'Discover movies and series, browse seasons and episodes, and watch in a modern player.',
  applicationName: 'Co Stream',
  authors: [{ name: 'Co Stream' }],
  keywords: ['movie discovery', 'series episodes', 'video player', 'watchlist', 'streaming platforms'],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Co Stream',
    title: 'Co Stream — Your cinema, together',
    description: 'Movie and series discovery with season-wise episodes and a modern player.',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Co Stream — Your cinema, together',
    description: 'Discover, queue, and watch movies or season-wise series episodes.',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#05090c',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('co_theme')||'SYSTEM';var d=t==='DARK'||(t==='SYSTEM'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <StreamProvider>
          <AuthGate>
            {children}
            <PwaRegister />
          </AuthGate>
        </StreamProvider>
      </body>
    </html>
  );
}
