import { isAllowedNetMirrorTarget } from '@/lib/netmirror';

function toWebVtt(input: string) {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (normalized.trimStart().startsWith('WEBVTT')) return normalized;
  return `WEBVTT\n\n${normalized
    .replace(/\{\\[^}]+\}/g, '')
    .replace(
      /(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/g,
      '$1.$2 --> $3.$4',
    )}`;
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('target') || '';
  if (!target || !isAllowedNetMirrorTarget(target)) {
    return new Response('Subtitle target is not allowed.', { status: 400 });
  }

  try {
    const url = new URL(target);
    const response = await fetch(target, {
      headers: {
        Accept: 'text/plain,*/*',
        Referer: `${url.protocol}//${url.host}/`,
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return new Response('Subtitle is unavailable.', { status: 502 });
    return new Response(toWebVtt(await response.text()), {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('Subtitle is unavailable.', { status: 502 });
  }
}
