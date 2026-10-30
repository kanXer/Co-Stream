export type CoWatchMessage = {
  type: 'play' | 'pause' | 'seek' | 'ready';
  time?: number;
  roomId: string;
  itemId: string;
};

let channel: BroadcastChannel | null = null;

export function getCoChannel(roomId: string) {
  if (typeof window === 'undefined') return null;
  if (channel && channel.name === roomId) return channel;
  try {
    channel = new BroadcastChannel(`co-stream-${roomId}`);
  } catch {
    channel = null;
  }
  return channel;
}

export function getRoomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('co') || null;
}

export function buildCoUrl(baseUrl: string, roomId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('co', roomId);
  return url.toString();
}

export function copyCoLink(roomId: string) {
  const url = buildCoUrl(window.location.origin + window.location.pathname, roomId);
  navigator.clipboard.writeText(url).catch(() => {});
  return url;
}
