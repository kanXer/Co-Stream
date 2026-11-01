'use client';

import type { MediaDetails, MediaItem } from '@/types';

type PlaybackRequest = {
  expires: number;
  promise: Promise<MediaDetails>;
};

const playbackRequests = new Map<string, PlaybackRequest>();

function playbackPath(item: MediaItem) {
  const params = new URLSearchParams({
    id: item.providerId,
    title: item.title,
    type: item.mediaType,
    year: item.year,
    playbackOnly: '1',
  });
  if (item.selectedSeason) params.set('season', String(item.selectedSeason));
  if (item.selectedEpisode) params.set('episode', String(item.selectedEpisode));
  return `/api/netmirror/title?${params.toString()}`;
}

export function resolveNetMirrorPlayback(item: MediaItem) {
  const path = playbackPath(item);
  const cached = playbackRequests.get(path);
  if (cached && cached.expires > Date.now()) return cached.promise;

  let cooldownMs = 8_000;
  let entry: PlaybackRequest | undefined;
  const promise = (async () => {
    try {
      const response = await fetch(path);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = Number(retryAfter);
        const retryDateMs = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
        cooldownMs = Number.isFinite(seconds)
          ? Math.max(1_000, Math.min(120_000, seconds * 1000))
          : Number.isFinite(retryDateMs)
            ? Math.max(1_000, Math.min(120_000, retryDateMs))
            : 15_000;
      }
      const payload = await response.json() as MediaDetails & { error?: string };
      if (!response.ok || !payload.playback?.url) {
        throw new Error(payload.error || 'Could not resolve playback.');
      }
      return payload;
    } catch (error) {
      // Keep failed resolutions briefly so a tap, remount, or Strict Mode
      // effect cannot immediately repeat the same upstream request.
      if (entry) entry.expires = Date.now() + cooldownMs;
      throw error instanceof Error ? error : new Error('Could not resolve playback.');
    }
  })();

  if (playbackRequests.size > 100) playbackRequests.clear();
  entry = { promise, expires: Date.now() + 45 * 1000 };
  playbackRequests.set(path, entry);
  return promise;
}

export function prefetchNetMirrorPlayback(item: MediaItem) {
  if (!item.id.startsWith('netmirror-')) return;
  if (item.playback?.resolvedAt && Date.now() - item.playback.resolvedAt < 2 * 60 * 1000) return;
  void resolveNetMirrorPlayback(item).catch(() => undefined);
}
