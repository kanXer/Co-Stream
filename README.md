# Co Stream

A responsive movie and series client with platform-personalized discovery,
season/episode browsing, watchlists, history, resume progress, a modern custom
player, and PWA installation.

## Current UI

- First-run multi-platform picker (Netflix, Amazon Prime, JioHotstar, SonyLIV,
  Apple TV+, Crunchyroll, and Amazon MX Player).
- Latest-updated row followed by a ranked top-10 row for each chosen platform.
- Four primary tabs: Home, Movies, Web Series, and Offline. Search remains
  available from the header.
- Season-wise episode browser for series.
- Custom player with quality selection, subtitle on/off and language selection,
  audio-language switching, animated controls, left/right double-tap ±10 seconds,
  pinch Fit/Fill, non-pausing single-tap controls, a consolidated top-right
  settings menu, volume, landscape-oriented fullscreen, and iOS fallback.
- 1080p-first playback with automatic lower-quality recovery on prolonged
  buffering, plus smaller offline-download sources stored on the device.

## Content sources

- **Experimental/research only:** the app uses NetMirror's current unofficial
  catalog, title, season, and signed-MP4 embed APIs. Requests are kept behind a
  host-allowlisted server proxy with CDN-specific referers and byte-range support.
- The old `net52.cc` HLS path is intentionally not used because it currently
  serves an anti-abuse warning video instead of the selected title.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>.

No catalog key is required. Optional Firebase Web values enable Google sign-in;
guest mode works without Firebase.

For WhatsApp and other social previews, set `NEXT_PUBLIC_SITE_URL` to the final
public HTTPS deployment URL. Vercel production URL variables are detected
automatically when this value is not configured. The repository includes a
lightweight `1200x630` JPEG Open Graph image at `public/og-image.jpg`.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm start
```

## Offline playback

Only direct sources explicitly marked downloadable are stored in IndexedDB. Embedded YouTube trailers cannot be downloaded. Add production video sources only when you own the content or have distribution rights.
