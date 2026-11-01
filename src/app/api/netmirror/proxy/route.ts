import { proxyNetMirrorTarget } from '@/lib/netmirror';

// Media segments are 6-8 MB and the upstream CDN can take tens of seconds on a
// cold lambda. Function was killed long before upstream responded, so every
// segment request fell into endless hls.js retries = permanent buffering.
// Match the in-code timeouts (30s per attempt x 4 attempts).
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target');
  if (!target) return new Response('Missing target URL.', { status: 400 });
  return proxyNetMirrorTarget(target, request);
}

export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target');
  if (!target) return new Response('Missing target URL.', { status: 400 });
  return proxyNetMirrorTarget(target, request);
}
