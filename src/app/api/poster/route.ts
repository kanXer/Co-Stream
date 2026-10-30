import 'server-only';

type PosterEntry = { url: string | null; expires: number };

const globalForPosters = globalThis as typeof globalThis & {
  __coPosterCache?: Map<string, PosterEntry>;
};

const cache = globalForPosters.__coPosterCache || new Map<string, PosterEntry>();
globalForPosters.__coPosterCache = cache;

function pickPoster(payload: { d?: Array<{ l?: string; y?: number; i?: { imageUrl?: string } }> }, title: string) {
  const candidates = payload.d || [];
  const exact = candidates.find((entry) => entry.l?.trim().toLowerCase() === title.toLowerCase());
  const pick = exact || candidates[0];
  return pick?.i?.imageUrl || null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').trim().slice(0, 120);
  if (!title) return new Response('Missing title.', { status: 400 });

  const key = title.toLowerCase();
  let entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    try {
      const response = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(title)}.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error(`IMDb suggestion failed (${response.status})`);
      const payload = await response.json() as { d?: Array<{ l?: string; y?: number; i?: { imageUrl?: string } }> };
      entry = { url: pickPoster(payload, title), expires: Date.now() + 24 * 60 * 60 * 1000 };
    } catch {
      entry = { url: null, expires: Date.now() + 10 * 60 * 1000 };
    }
    cache.set(key, entry);
  }

  if (!entry.url) return new Response('Poster not found.', { status: 404 });

  try {
    const image = await fetch(entry.url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.imdb.com/' },
      signal: AbortSignal.timeout(10000),
    });
    if (!image.ok) return new Response('Poster not found.', { status: 404 });
    return new Response(image.body, {
      headers: {
        'Content-Type': image.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('Poster not found.', { status: 404 });
  }
}
