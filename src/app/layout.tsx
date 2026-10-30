import type { Metadata, Viewport } from 'next';
import { AuthGate } from '@/components/AuthGate';
import PwaRegister from '@/components/PwaRegister';
import { StreamProvider } from '@/context/StreamContext';
import { getSiteUrl } from '@/lib/site';
import './globals.css';

const siteUrl = getSiteUrl();
const title = 'Co Stream — Your cinema, together';
const description = 'Discover Hindi movies and web series, browse every season and episode, and watch with quality, subtitle, audio-language, and offline controls.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s | Co Stream',
  },
  description,
  applicationName: 'Co Stream',
  authors: [{ name: 'Co Stream', url: siteUrl }],
  creator: 'Co Stream',
  publisher: 'Co Stream',
  category: 'entertainment',
  referrer: 'origin-when-cross-origin',
  keywords: ['movie discovery', 'series episodes', 'video player', 'watchlist', 'streaming platforms'],
  alternates: { canonical: '/' },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Co Stream',
    statusBarStyle: 'black-translucent',
  },
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
    url: '/',
    locale: 'en_IN',
    siteName: 'Co Stream',
    title,
    description,
    images: [{
      url: '/og-image.jpg',
      width: 1200,
      height: 630,
      alt: 'Co Stream — Your cinema, together',
      type: 'image/jpeg',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [{
      url: '/og-image.jpg',
      width: 1200,
      height: 630,
      alt: 'Co Stream — Your cinema, together',
    }],
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
