import { proxyNetMirrorTarget } from '@/lib/netmirror';

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