'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type { MediaItem, PlaybackSource } from '@/types';

export type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'error';

export interface DownloadState {
  status: DownloadStatus;
  /** 0..1; -1 means that the server did not provide a content length. */
  progress: number;
  error?: string;
}

export interface OfflineVideoMeta {
  id: string;
  item: MediaItem;
  downloadedAt: number;
  fileSize: number;
  coverSize: number;
  mimeType: string;
}

interface OfflineVideoRecord extends OfflineVideoMeta {
  videoBlob: Blob;
  coverBlob: Blob | null;
}

const DB_NAME = 'co-stream-offline';
const DB_VERSION = 1;
const STORE = 'videos';
const EVENT_NAME = 'co-downloads';

let dbPromise: Promise<IDBPDatabase> | null = null;
const states = new Map<string, DownloadState>();
const listeners = new Set<() => void>();
const playbackUrls = new Map<string, string>();
const coverUrls = new Map<string, string>();

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

function setState(id: string, state: DownloadState) {
  states.set(id, state);
  listeners.forEach((listener) => listener());
}

function announceListChange() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getDownloadState(id: string | null | undefined): DownloadState {
  if (!id) return { status: 'idle', progress: 0 };
  return states.get(id) || { status: 'idle', progress: 0 };
}

async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (_) {
    // Persistence is best-effort; IndexedDB still works when permission is denied.
  }
}

async function assertQuota(neededBytes: number) {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return;
    const free = estimate.quota - (estimate.usage || 0);
    if (neededBytes > free) {
      throw new Error(`Not enough device storage. Need about ${Math.ceil(neededBytes / 1048576)} MB.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Not enough')) throw error;
  }
}

async function fetchBlobWithProgress(
  url: string,
  onProgress: (received: number, total: number) => void,
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video download failed (${response.status}).`);

  const total = Number(response.headers.get('content-length')) || 0;
  const contentType = response.headers.get('content-type') || 'video/mp4';
  if (total) await assertQuota(total);

  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, blob.size);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }
  return new Blob(chunks, { type: contentType });
}

async function fetchCover(url: string | null): Promise<Blob | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size <= 10 * 1024 * 1024 ? blob : null;
  } catch (_) {
    return null;
  }
}

export async function startVideoDownload(item: MediaItem, source?: PlaybackSource | null) {
  const playback = source || item.playback;
  if (!playback || playback.kind !== 'direct' || !playback.url || !playback.downloadable) {
    setState(item.id, {
      status: 'error',
      progress: 0,
      error: 'Offline saving is not available for this source.',
    });
    return;
  }
  if (states.get(item.id)?.status === 'downloading') return;

  setState(item.id, { status: 'downloading', progress: -1 });
  try {
    await requestPersistence();
    await assertQuota(20 * 1024 * 1024);

    const videoBlob = await fetchBlobWithProgress(playback.downloadUrl || playback.url, (received, total) => {
      setState(item.id, {
        status: 'downloading',
        progress: total > 0 ? received / total : -1,
      });
    });
    if (videoBlob.size < 1024) throw new Error('The downloaded video was empty.');
    await assertQuota(videoBlob.size);

    const coverBlob = await fetchCover(item.posterUrl);
    const record: OfflineVideoRecord = {
      id: item.id,
      item: { ...item, playback },
      downloadedAt: Date.now(),
      fileSize: videoBlob.size,
      coverSize: coverBlob?.size || 0,
      mimeType: videoBlob.type || playback.mimeType || 'video/mp4',
      videoBlob,
      coverBlob,
    };

    const db = await getDb();
    await db.put(STORE, record);
    setState(item.id, { status: 'downloaded', progress: 1 });
    announceListChange();
  } catch (error) {
    setState(item.id, {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'Download failed.',
    });
  }
}

export async function getAllDownloadedVideos(): Promise<OfflineVideoMeta[]> {
  try {
    const db = await getDb();
    const records = await db.getAll(STORE) as OfflineVideoRecord[];
    return records
      .map(({ videoBlob: _video, coverBlob: _cover, ...meta }) => meta)
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch (_) {
    return [];
  }
}

export async function isVideoDownloaded(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    return Boolean(await db.getKey(STORE, id));
  } catch (_) {
    return false;
  }
}

export async function getOfflinePlaybackUrl(id: string): Promise<string | null> {
  const cached = playbackUrls.get(id);
  if (cached) return cached;
  try {
    const db = await getDb();
    const record = await db.get(STORE, id) as OfflineVideoRecord | undefined;
    if (!record?.videoBlob) return null;
    const url = URL.createObjectURL(record.videoBlob);
    playbackUrls.set(id, url);
    return url;
  } catch (_) {
    return null;
  }
}

export async function getOfflineCoverUrl(id: string): Promise<string | null> {
  const cached = coverUrls.get(id);
  if (cached) return cached;
  try {
    const db = await getDb();
    const record = await db.get(STORE, id) as OfflineVideoRecord | undefined;
    if (!record?.coverBlob) return null;
    const url = URL.createObjectURL(record.coverBlob);
    coverUrls.set(id, url);
    return url;
  } catch (_) {
    return null;
  }
}

export async function deleteDownloadedVideo(id: string) {
  const db = await getDb();
  await db.delete(STORE, id);
  const playbackUrl = playbackUrls.get(id);
  if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  playbackUrls.delete(id);
  const coverUrl = coverUrls.get(id);
  if (coverUrl) URL.revokeObjectURL(coverUrl);
  coverUrls.delete(id);
  setState(id, { status: 'idle', progress: 0 });
  announceListChange();
}

export async function getStorageInfo() {
  const videos = await getAllDownloadedVideos();
  const videosBytes = videos.reduce((sum, video) => sum + video.fileSize + video.coverSize, 0);
  try {
    const estimate = await navigator.storage?.estimate?.();
    return { videosBytes, usage: estimate?.usage || 0, quota: estimate?.quota || 0 };
  } catch (_) {
    return { videosBytes, usage: 0, quota: 0 };
  }
}

export const DOWNLOADS_EVENT = EVENT_NAME;
