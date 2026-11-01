// Client-safe URL helpers shared by the server lib (netmirror.ts) and the
// player component. Must not import 'server-only'.

export function proxiedMediaPath(target: string) {
  const isManifest = target.includes('.m3u8') || target.startsWith('synthetic:');
  const isSegment = /\.(ts|js|woff2)$/i.test(target) || (target.includes('/files/') && /\.(jpg|jpeg)$/i.test(target));
  const extSuffix = isSegment ? '&file=segment.ts' : isManifest ? '&file=playlist.m3u8' : '';
  return `/api/netmirror/proxy?target=${encodeURIComponent(target)}${extSuffix}`;
}

// Verified against the live CDNs: NetMirror's media hosts (*.top with the
// /files/<id>/... layout) serve every segment with `Access-Control-Allow-Origin: *`
// and byte-range support, so the browser can fetch them directly — exactly how
// the Android app streams. Manifests still go through the proxy (they need URI
// rewriting); only leaf media segments go direct. This removes the Vercel
// lambda hop that throttled throughput and caused stutter/heavy buffering.
export function directCdnSegmentUrl(target: string): string | null {
  if (target.startsWith('synthetic:')) return null;
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (!host.endsWith('.top')) return null;
    if (!/\/files\/[a-z0-9._-]+\//i.test(path)) return null;
    if (!/\.(ts|js|woff2|jpg|jpeg)$/i.test(path)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
