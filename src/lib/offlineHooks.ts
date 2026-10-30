'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DOWNLOADS_EVENT,
  getAllDownloadedVideos,
  getActiveDownloads,
  getDownloadState,
  getOfflineCoverUrl,
  subscribeDownloads,
  type DownloadState,
  type OfflineVideoMeta,
  type ActiveDownload,
} from '@/lib/offlineStore';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return { isOnline };
}

export function useDownloadState(id: string | null | undefined): DownloadState {
  const [state, setState] = useState<DownloadState>(() => getDownloadState(id));
  useEffect(() => {
    const sync = () => setState(getDownloadState(id));
    sync();
    return subscribeDownloads(sync);
  }, [id]);
  return state;
}

export function useDownloadedList() {
  const [videos, setVideos] = useState<OfflineVideoMeta[]>([]);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());

  const refresh = useCallback(() => {
    getAllDownloadedVideos().then(async (list) => {
      setVideos(list);
      const entries = await Promise.all(
        list.map(async (video) => [video.id, await getOfflineCoverUrl(video.id)] as const),
      );
      setCovers(new Map(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))));
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(DOWNLOADS_EVENT, refresh);
    return () => window.removeEventListener(DOWNLOADS_EVENT, refresh);
  }, [refresh]);

  return { videos, covers, refresh };
}

export function useDownloadedIds() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    const refresh = () => {
      getAllDownloadedVideos().then((list) => {
        if (active) setIds(new Set(list.map((video) => video.id)));
      });
    };
    refresh();
    window.addEventListener(DOWNLOADS_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(DOWNLOADS_EVENT, refresh);
    };
  }, []);
  return ids;
}

export function useActiveDownloads() {
  const [downloads, setDownloads] = useState<ActiveDownload[]>(() => getActiveDownloads());
  useEffect(() => {
    const refresh = () => setDownloads(getActiveDownloads());
    refresh();
    return subscribeDownloads(refresh);
  }, []);
  return downloads;
}
