// Client-safe URL helpers shared by the server lib (netmirror.ts) and the
// player component. Must not import 'server-only'.

export function proxiedMediaPath(target: string) {
  const isManifest = target.includes('.m3u8') || target.startsWith('synthetic:');
  const isSegment = /\.(ts|js|woff2)$/i.test(target) || (target.includes('/files/') && /\.(jpg|jpeg)$/i.test(target));
  const extSuffix = isSegment ? '&file=segment.ts' : isManifest ? '&file=playlist.m3u8' : '';
  return `/api/netmirror/proxy?target=${encodeURIComponent(target)}${extSuffix}`;
}

// Some NetMirror host aliases fail browser CORS even though their segments are
// reachable from the server proxy. Sending those directly makes the browser
// discard one request and then fetch the same segment again through the proxy,
// which can trigger upstream rate limits. Keep direct fetches only for the
// aliases verified to support browser CORS.
export function directCdnSegmentUrl(target: string): string | null {
  if (target.startsWith('synthetic:')) return null;
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (!host.endsWith('.top')) return null;
    if (/^makhi\d*\.top$/.test(host) || /^s\d+\.nm-cdn\d+\.top$/.test(host)) return null;
    if (!/\/files\/[a-z0-9._-]+\//i.test(path)) return null;
    if (!/\.(ts|js|woff2|jpg|jpeg)$/i.test(path)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
