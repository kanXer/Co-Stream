'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Download, Film, HardDrive, Play, Search, Trash2, Tv, WifiOff } from 'lucide-react';
import { useStream } from '@/context/StreamContext';
import { useDownloadedList, useOfflineStatus } from '@/lib/offlineHooks';
import { deleteDownloadedVideo, getStorageInfo } from '@/lib/offlineStore';

type Filter = 'all' | 'movie' | 'tv';

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function OfflineLibrary() {
  const { playItem } = useStream();
  const { videos, covers, refresh } = useDownloadedList();
  const { isOnline } = useOfflineStatus();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [storage, setStorage] = useState({ videosBytes: 0, quota: 0 });

  const refreshStorage = () => getStorageInfo().then((value) => setStorage({
    videosBytes: value.videosBytes,
    quota: value.quota,
  }));
  useEffect(() => { void refreshStorage(); }, [videos.length]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return videos.filter(({ item }) => (
      (filter === 'all' || item.mediaType === filter)
      && (!clean || `${item.title} ${item.year}`.toLowerCase().includes(clean))
    ));
  }, [videos, filter, query]);
  const movieCount = videos.filter((entry) => entry.item.mediaType === 'movie').length;
  const seriesCount = videos.filter((entry) => entry.item.mediaType === 'tv').length;
  const queue = filtered.map((entry) => entry.item);

  return (
    <div className="page-enter min-w-0 pt-5 sm:pt-7 pb-10">
      <div className="relative overflow-hidden rounded-[30px] border border-[var(--line)] bg-gradient-to-br from-[var(--panel-elevated)] via-[var(--panel)] to-[var(--accent-soft)] p-5 sm:p-7">
        <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="eyebrow">Saved on this device</p><h1 className="page-title mt-1">Offline</h1><p className="page-subtitle">Movies and episodes ready without internet.</p></div>
          <span className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-lg"><Download size={22} /></span>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          <OfflineStat icon={<Film size={16} />} value={movieCount} label="Movies" />
          <OfflineStat icon={<Tv size={16} />} value={seriesCount} label="Series episodes" />
          <OfflineStat icon={<HardDrive size={16} />} value={formatBytes(storage.videosBytes)} label="Storage used" />
        </div>
        {storage.quota > 0 && <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${Math.min(100, (storage.videosBytes / storage.quota) * 100)}%` }} /></div>}
      </div>

      {!isOnline && videos.length > 0 && <div className="mt-4 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 flex items-center gap-2 text-xs font-bold text-[var(--accent)]"><WifiOff size={16} />Offline mode active — saved videos remain playable.</div>}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <label className="search-field flex-1 min-w-0"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search offline titles" /></label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-full">
          {([['all', 'All'], ['movie', 'Movies'], ['tv', 'Web Series']] as Array<[Filter, string]>).map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`filter-chip ${filter === id ? 'active' : ''}`}>{label}</button>)}
        </div>
      </div>

      {!filtered.length ? (
        <div className="mt-7 min-h-64 rounded-[28px] border-2 border-dashed border-[var(--line)] bg-[var(--panel)] flex flex-col items-center justify-center text-center p-6">
          <span className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center"><Download size={28} /></span>
          <h2 className="mt-4 text-lg font-black">{videos.length ? 'No matching downloads' : 'Nothing saved yet'}</h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)]">Open a movie or episode and tap “Save offline”. Completed downloads appear here.</p>
        </div>
      ) : (
        <div className="mt-7 responsive-media-grid">
          {filtered.map((download) => {
            const item = download.item;
            const cover = covers.get(download.id) || item.posterUrl;
            return (
              <article key={download.id} className="group min-w-0 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_10px_30px_rgba(0,0,0,.1)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,.16)]">
                <button onClick={() => playItem(item, queue)} className="relative block w-full aspect-video overflow-hidden bg-black/10 text-left">
                  {cover ? <Image src={cover} alt={item.title} fill sizes="(max-width: 640px) 50vw, 260px" className="object-cover transition duration-500 group-hover:scale-105" /> : <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">{item.mediaType === 'tv' ? <Tv size={30} /> : <Film size={30} />}</span>}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white">{item.mediaType === 'tv' ? 'Web Series' : 'Movie'}</span>
                  <span className="absolute right-3 bottom-3 w-11 h-11 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-xl"><Play size={18} className="fill-current ml-0.5" /></span>
                </button>
                <div className="p-3.5 min-w-0">
                  <h3 className="truncate text-sm font-black">{item.title}</h3>
                  <p className="mt-1 truncate text-[10px] font-semibold text-[var(--text-faint)]">{formatBytes(download.fileSize)} · {new Date(download.downloadedAt).toLocaleDateString()}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => playItem(item, queue)} className="primary-button !min-h-9 flex-1 !px-3"><Play size={14} className="fill-current" />Play</button>
                    <button onClick={() => deleteDownloadedVideo(download.id).then(() => { refresh(); void refreshStorage(); })} className="icon-button hover:!text-red-500" title="Delete download"><Trash2 size={16} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OfflineStat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)]/75 p-3 backdrop-blur-md"><div className="flex items-center gap-1.5 text-[var(--accent)]">{icon}<span className="truncate text-sm font-black text-[var(--text)]">{value}</span></div><p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</p></div>;
}
