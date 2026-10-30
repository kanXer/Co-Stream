const OPEN_MEDIA: Record<string, string> = {
  'sintel-trailer': 'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'bunny-trailer': 'https://media.w3.org/2010/05/bunny/trailer.mp4',
  'video-captions': 'https://media.w3.org/wai/perspective-videos/video-captions.mp4',
  'clear-layout': 'https://media.w3.org/wai/perspective-videos/clear-layout-design.mp4',
};

async function relay(request: Request, slug: string, method: 'GET' | 'HEAD') {
  const upstreamUrl = OPEN_MEDIA[slug];
  if (!upstreamUrl) return new Response('Unknown open media asset.', { status: 404 });

  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    cache: 'no-store',
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Open media source is temporarily unavailable.', { status: 502 });
  }

  const responseHeaders = new Headers({
    'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Content-Disposition': 'inline',
  });
  for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return relay(request, (await params).slug, 'GET');
}

export async function HEAD(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return relay(request, (await params).slug, 'HEAD');
}
