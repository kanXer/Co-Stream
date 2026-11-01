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

  const promise = (async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(path);
        const payload = await response.json() as MediaDetails & { error?: string };
        if (!response.ok || !payload.playback?.url) {
          throw new Error(payload.error || 'Could not resolve playback.');
        }
        return payload;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Could not resolve playback.');
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    playbackRequests.delete(path);
    throw lastError || new Error('Could not resolve playback.');
  })();

  if (playbackRequests.size > 100) playbackRequests.clear();
  playbackRequests.set(path, { promise, expires: Date.now() + 45 * 1000 });
  return promise;
}

export function prefetchNetMirrorPlayback(item: MediaItem) {
  if (!item.id.startsWith('netmirror-')) return;
  if (item.playback?.resolvedAt && Date.now() - item.playback.resolvedAt < 2 * 60 * 1000) return;
  void resolveNetMirrorPlayback(item).catch(() => undefined);
}
