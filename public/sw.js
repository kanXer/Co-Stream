const CACHE = 'co-stream-v12';
const PRECACHE = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const OFFLINE_DB = 'co-stream-offline';
const OFFLINE_DB_VERSION = 2;
const OFFLINE_STORE = 'videos';
const PENDING_STORE = 'pending';
const OFFLINE_MEDIA_CACHE = 'co-stream-offline-media-v1';

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction aborted.'));
  });
}

async function notifyDownloadClients(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(message));
}

async function pendingDownload(id) {
  const db = await openOfflineDb();
  try {
    return await requestResult(db.transaction(PENDING_STORE).objectStore(PENDING_STORE).get(id));
  } finally {
    db.close();
  }
}

async function removePendingDownload(id) {
  const db = await openOfflineDb();
  try {
    const transaction = db.transaction(PENDING_STORE, 'readwrite');
    transaction.objectStore(PENDING_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function completeBackgroundDownload(registration) {
  const pending = await pendingDownload(registration.id);
  if (!pending) return;
  const records = await registration.matchAll();
  const videoRecord = records.find((record) => record.request.url === pending.videoUrl) || records[0];
  if (!videoRecord) throw new Error('Downloaded media response is missing.');
  const response = await videoRecord.responseReady;
  if (!response.ok) throw new Error(`Video download failed (${response.status}).`);

  const cacheUrl = new URL(`/__co_offline_video__/${encodeURIComponent(pending.mediaId)}`, self.location.origin).toString();
  const mediaCache = await caches.open(OFFLINE_MEDIA_CACHE);
  await mediaCache.put(cacheUrl, response.clone());

  let coverBlob = null;
  if (pending.coverUrl) {
    try {
      const coverResponse = await fetch(pending.coverUrl);
      if (coverResponse.ok) {
        const candidate = await coverResponse.blob();
        if (candidate.size <= 10 * 1024 * 1024) coverBlob = candidate;
      }
    } catch (_) {
      coverBlob = null;
    }
  }

  const db = await openOfflineDb();
  try {
    const transaction = db.transaction([OFFLINE_STORE, PENDING_STORE], 'readwrite');
    transaction.objectStore(OFFLINE_STORE).put({
      id: pending.mediaId,
      item: pending.item,
      downloadedAt: Date.now(),
      fileSize: Number(response.headers.get('content-length')) || registration.downloaded || 0,
      coverSize: coverBlob?.size || 0,
      mimeType: response.headers.get('content-type') || pending.playback?.mimeType || 'video/mp4',
      videoBlob: null,
      coverBlob,
      fileName: null,
      storageKind: 'cache',
      cacheUrl,
    });
    transaction.objectStore(PENDING_STORE).delete(registration.id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
  await notifyDownloadClients({ type: 'co-download-complete', mediaId: pending.mediaId });
}

async function failBackgroundDownload(registration, error) {
  const pending = await pendingDownload(registration.id).catch(() => null);
  await removePendingDownload(registration.id).catch(() => undefined);
  if (pending) {
    await notifyDownloadClients({
      type: 'co-download-failed',
      mediaId: pending.mediaId,
      error: error || 'Background download failed.',
    });
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('co-stream-v') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('backgroundfetchsuccess', (event) => {
  event.waitUntil(completeBackgroundDownload(event.registration)
    .then(() => event.updateUI({ title: 'Saved for offline viewing' }))
    .catch(async (error) => {
      await failBackgroundDownload(event.registration, error instanceof Error ? error.message : 'Could not save the download.');
      await event.updateUI({ title: 'Offline download failed' }).catch(() => undefined);
    }));
});

self.addEventListener('backgroundfetchfail', (event) => {
  event.waitUntil(failBackgroundDownload(event.registration, 'Download failed. Check your connection and retry.')
    .then(() => event.updateUI({ title: 'Offline download failed' }).catch(() => undefined)));
});

self.addEventListener('backgroundfetchabort', (event) => {
  event.waitUntil(failBackgroundDownload(event.registration, 'Download was canceled.')
    .then(() => event.updateUI({ title: 'Offline download canceled' }).catch(() => undefined)));
});

self.addEventListener('backgroundfetchclick', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    if (windows[0]) {
      await windows[0].navigate('/#offline');
      await windows[0].focus();
      return;
    }
    await self.clients.openWindow('/#offline');
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
