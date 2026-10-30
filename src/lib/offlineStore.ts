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

export interface ActiveDownload {
  item: MediaItem;
  state: DownloadState;
}

interface OfflineVideoRecord extends OfflineVideoMeta {
  videoBlob?: Blob | null;
  coverBlob: Blob | null;
  fileName?: string | null;
  storageKind?: 'indexeddb' | 'opfs' | 'cache';
  cacheUrl?: string | null;
}

interface BackgroundDownloadRecord {
  id: string;
  mediaId: string;
  item: MediaItem;
  playback: PlaybackSource;
  videoUrl: string;
  coverUrl: string | null;
  createdAt: number;
}

interface BackgroundFetchRegistrationLike extends EventTarget {
  id: string;
  downloaded: number;
  downloadTotal: number;
}

interface BackgroundFetchManagerLike {
  fetch: (
    id: string,
    requests: RequestInfo[],
    options?: { title?: string; icons?: Array<{ src: string; sizes?: string; type?: string; label?: string }> },
  ) => Promise<BackgroundFetchRegistrationLike>;
  get: (id: string) => Promise<BackgroundFetchRegistrationLike | undefined>;
  getIds: () => Promise<string[]>;
}

const DB_NAME = 'co-stream-offline';
const DB_VERSION = 2;
const STORE = 'videos';
const PENDING_STORE = 'pending';
const BACKGROUND_PREFIX = 'co-offline-';
const OFFLINE_MEDIA_CACHE = 'co-stream-offline-media-v1';
const EVENT_NAME = 'co-downloads';

let dbPromise: Promise<IDBPDatabase> | null = null;
const states = new Map<string, DownloadState>();
const activeDownloads = new Map<string, ActiveDownload>();
const listeners = new Set<() => void>();
const playbackUrls = new Map<string, string>();
const coverUrls = new Map<string, string>();
let backgroundIntegrationReady = false;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PENDING_STORE)) {
          db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

function setState(id: string, state: DownloadState) {
  states.set(id, state);
  const active = activeDownloads.get(id);
  if (active) activeDownloads.set(id, { ...active, state });
  listeners.forEach((listener) => listener());
}

function announceListChange() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeDownloads(listener: () => void) {
  ensureBackgroundIntegration();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getDownloadState(id: string | null | undefined): DownloadState {
  ensureBackgroundIntegration();
  if (!id) return { status: 'idle', progress: 0 };
  return states.get(id) || { status: 'idle', progress: 0 };
}

export function getActiveDownloads() {
  ensureBackgroundIntegration();
  return Array.from(activeDownloads.values());
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

function offlineHash(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function offlineFileName(id: string) {
  return `co-stream-${offlineHash(id)}.mp4`;
}

function backgroundDownloadId(id: string) {
  return `${BACKGROUND_PREFIX}${offlineHash(id)}`;
}

async function getBackgroundFetchManager() {
  if (
    typeof window === 'undefined'
    || !('serviceWorker' in navigator)
    || !('BackgroundFetchManager' in window)
  ) return null;
  const registration = await Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
  ]);
  if (!registration) return null;
  return (registration as ServiceWorkerRegistration & {
    backgroundFetch?: BackgroundFetchManagerLike;
  }).backgroundFetch || null;
}

function attachBackgroundProgress(
  registration: BackgroundFetchRegistrationLike,
  pending: BackgroundDownloadRecord,
) {
  activeDownloads.set(pending.mediaId, {
    item: pending.item,
    state: { status: 'downloading', progress: -1 },
  });
  const update = () => {
    setState(pending.mediaId, {
      status: 'downloading',
      progress: registration.downloadTotal > 0
        ? Math.min(1, registration.downloaded / registration.downloadTotal)
        : -1,
    });
  };
  registration.addEventListener('progress', update);
  update();
}

async function restoreBackgroundDownloads() {
  try {
    const manager = await getBackgroundFetchManager();
    if (!manager) return;
    const ids = await manager.getIds();
    const db = await getDb();
    await Promise.all(ids.filter((id) => id.startsWith(BACKGROUND_PREFIX)).map(async (id) => {
      const [registration, pending] = await Promise.all([
        manager.get(id),
        db.get(PENDING_STORE, id) as Promise<BackgroundDownloadRecord | undefined>,
      ]);
      if (registration && pending) attachBackgroundProgress(registration, pending);
    }));
  } catch (_) {
    // Foreground downloading remains available when restoration is unsupported.
  }
}

function ensureBackgroundIntegration() {
  if (backgroundIntegrationReady || typeof window === 'undefined') return;
  backgroundIntegrationReady = true;
  navigator.serviceWorker?.addEventListener('message', (event) => {
    const message = event.data as { type?: string; mediaId?: string; error?: string } | null;
    if (!message?.mediaId) return;
    if (message.type === 'co-download-complete') {
      activeDownloads.delete(message.mediaId);
      setState(message.mediaId, { status: 'downloaded', progress: 1 });
      announceListChange();
    } else if (message.type === 'co-download-failed') {
      activeDownloads.delete(message.mediaId);
      setState(message.mediaId, {
        status: 'error',
        progress: 0,
        error: message.error || 'Background download failed.',
      });
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void restoreBackgroundDownloads();
  });
  void restoreBackgroundDownloads();
}

async function startBackgroundDownload(item: MediaItem, playback: PlaybackSource) {
  const manager = await getBackgroundFetchManager();
  if (!manager) return false;
  const videoUrl = playback.downloadUrl || playback.url;
  if (!videoUrl) return false;

  const id = backgroundDownloadId(item.id);
  const pending: BackgroundDownloadRecord = {
    id,
    mediaId: item.id,
    item: { ...item, playback },
    playback,
    videoUrl: new URL(videoUrl, window.location.href).toString(),
    coverUrl: item.posterUrl ? new URL(item.posterUrl, window.location.href).toString() : null,
    createdAt: Date.now(),
  };
  const db = await getDb();
  await db.put(PENDING_STORE, pending);
  try {
    const existing = await manager.get(id);
    const registration = existing || await manager.fetch(
      id,
      [new Request(pending.videoUrl, { credentials: 'same-origin' })],
      {
        title: `Saving ${item.title}`.slice(0, 80),
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', label: 'Co-Stream download' }],
      },
    );
    attachBackgroundProgress(registration, pending);
    return true;
  } catch (error) {
    await db.delete(PENDING_STORE, id);
    throw error;
  }
}

async function downloadVideoWithProgress(
  url: string,
  id: string,
  onProgress: (received: number, total: number) => void,
): Promise<{ blob: Blob | null; fileName: string | null; size: number; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video download failed (${response.status}).`);

  const total = Number(response.headers.get('content-length')) || 0;
  const contentType = response.headers.get('content-type') || 'video/mp4';
  if (total) await assertQuota(total);

  const storageWithDirectory = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (response.body && storageWithDirectory.getDirectory) {
    const fileName = offlineFileName(id);
    const root = await storageWithDirectory.getDirectory();
    try {
      const handle = await root.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      let received = 0;
      let lastUpdate = 0;
      const tracked = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          const now = performance.now();
          if (now - lastUpdate > 180 || (total > 0 && received >= total)) {
            onProgress(received, total);
            lastUpdate = now;
          }
          controller.enqueue(chunk);
        },
      });
      await response.body.pipeThrough(tracked).pipeTo(writable);
      const file = await handle.getFile();
      onProgress(file.size, total || file.size);
      return { blob: null, fileName, size: file.size, contentType };
    } catch (error) {
      await root.removeEntry(fileName).catch(() => undefined);
      throw error;
    }
  }

  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, blob.size);
    return { blob, fileName: null, size: blob.size, contentType };
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
  const blob = new Blob(chunks, { type: contentType });
  return { blob, fileName: null, size: blob.size, contentType };
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
  ensureBackgroundIntegration();
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

  activeDownloads.set(item.id, { item, state: { status: 'downloading', progress: 0 } });
  setState(item.id, { status: 'downloading', progress: 0 });
  try {
    await requestPersistence();
    await assertQuota(20 * 1024 * 1024);

    try {
      if (await startBackgroundDownload(item, playback)) return;
    } catch (_) {
      // Permission or implementation failures fall back to the foreground path.
    }

    const video = await downloadVideoWithProgress(playback.downloadUrl || playback.url, item.id, (received, total) => {
      setState(item.id, {
        status: 'downloading',
        progress: total > 0 ? received / total : -1,
      });
    });
    if (video.size < 1024) throw new Error('The downloaded video was empty.');
    if (video.blob) await assertQuota(video.size);

    const coverBlob = await fetchCover(item.posterUrl);
    const record: OfflineVideoRecord = {
      id: item.id,
      item: { ...item, playback },
      downloadedAt: Date.now(),
      fileSize: video.size,
      coverSize: coverBlob?.size || 0,
      mimeType: video.contentType || playback.mimeType || 'video/mp4',
      videoBlob: video.blob,
      coverBlob,
      fileName: video.fileName,
      storageKind: video.fileName ? 'opfs' : 'indexeddb',
    };

    const db = await getDb();
    await db.put(STORE, record);
    setState(item.id, { status: 'downloaded', progress: 1 });
    activeDownloads.delete(item.id);
    listeners.forEach((listener) => listener());
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
      .map(({ videoBlob: _video, coverBlob: _cover, fileName: _file, storageKind: _storage, cacheUrl: _cache, ...meta }) => meta)
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
    if (!record) return null;
    let media: Blob | File | null = record.videoBlob || null;
    if (!media && record.fileName) {
      const storageWithDirectory = navigator.storage as StorageManager & {
        getDirectory?: () => Promise<FileSystemDirectoryHandle>;
      };
      const root = await storageWithDirectory.getDirectory?.();
      const handle = await root?.getFileHandle(record.fileName);
      media = await handle?.getFile() || null;
    }
    if (!media && record.cacheUrl && 'caches' in window) {
      const cache = await caches.open(OFFLINE_MEDIA_CACHE);
      const response = await cache.match(record.cacheUrl, { ignoreVary: true });
      media = await response?.blob() || null;
    }
    if (!media) return null;
    const url = URL.createObjectURL(media);
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
  const record = await db.get(STORE, id) as OfflineVideoRecord | undefined;
  await db.delete(STORE, id);
  await db.delete(PENDING_STORE, backgroundDownloadId(id));
  if (record?.fileName) {
    const storageWithDirectory = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    const root = await storageWithDirectory.getDirectory?.();
    await root?.removeEntry(record.fileName).catch(() => undefined);
  }
  if (record?.cacheUrl && 'caches' in window) {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE);
    await cache.delete(record.cacheUrl, { ignoreVary: true });
  }
  const playbackUrl = playbackUrls.get(id);
  if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  playbackUrls.delete(id);
  const coverUrl = coverUrls.get(id);
  if (coverUrl) URL.revokeObjectURL(coverUrl);
  coverUrls.delete(id);
  setState(id, { status: 'idle', progress: 0 });
  activeDownloads.delete(id);
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
