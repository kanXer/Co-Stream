'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Bookmark,
  Clock3,
  Download,
  Film,
  HardDrive,
  ListPlus,
  Play,
  Plus,
  Search,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { MediaCard, MediaRow } from '@/components/MediaCard';
import { useStream } from '@/context/StreamContext';
import { useDownloadedList, useOfflineStatus } from '@/lib/offlineHooks';
import { deleteDownloadedVideo, getStorageInfo } from '@/lib/offlineStore';
import type { MediaItem } from '@/types';

type Section = 'overview' | 'watchlist' | 'history' | 'lists' | 'downloads';
type Sort = 'recent' | 'title' | 'year';

export function LibraryView({
  onOpen,
  onOpenSearch,
}: {
  onOpen: (item: MediaItem) => void;
  onOpenSearch: () => void;
}) {
  const {
    watchlist,
    recentItems,
    collections,
    createCollection,
    deleteCollection,
    removeFromCollection,
    playItem,
    watchProgress,
  } = useStream();
  const { videos: downloads, covers, refresh } = useDownloadedList();
  const { isOnline } = useOfflineStatus();
  const [section, setSection] = useState<Section>('overview');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [newList, setNewList] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [storage, setStorage] = useState<{ videosBytes: number; quota: number } | null>(null);

  const refreshStorage = () => getStorageInfo().then((info) => setStorage({ videosBytes: info.videosBytes, quota: info.quota }));
  useEffect(() => { refreshStorage(); }, [downloads.length]);

  const filterAndSort = (items: MediaItem[]) => {
    const clean = query.trim().toLowerCase();
    const result = items.filter((item) => !clean || [item.title, item.year, ...item.genres].join(' ').toLowerCase().includes(clean));
    if (sort === 'title') return [...result].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'year') return [...result].sort((a, b) => b.year.localeCompare(a.year));
    return result;
  };

  const filteredWatchlist = filterAndSort(watchlist);
  const filteredHistory = filterAndSort(recentItems);
  const continueWatching = useMemo(() => recentItems.filter((item) => {
    const progress = watchProgress[item.id];
    return progress && progress.position > 10 && progress.position < progress.duration - 15;
  }), [recentItems, watchProgress]);

  const create = () => {
    if (createCollection(newList)) {
      setNewList('');
      setShowCreate(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  return (
    <div className="pt-5 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div><p className="eyebrow">Your space</p><h2 className="page-title">Library</h2><p className="page-subtitle">Watchlists, history, downloads and personal collections.</p></div>
        <button onClick={onOpenSearch} className="icon-button mt-1"><Search size={18} /></button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <label className="search-field flex-1"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" /></label>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="field sm:w-40">
          <option value="recent">Recently added</option>
          <option value="title">Title A–Z</option>
          <option value="year">Newest year</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mt-4 pb-1">
        {([
          ['overview', 'Overview'],
          ['watchlist', 'Watchlist'],
          ['history', 'History'],
          ['lists', 'My lists'],
          ['downloads', 'Downloads'],
        ] as Array<[Section, string]>).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} className={`filter-chip ${section === id ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {section === 'overview' && (
        <div className="mt-6 space-y-8">
          <button onClick={() => setSection('watchlist')} className="relative w-full overflow-hidden rounded-[28px] border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-soft)] via-[var(--panel)] to-[var(--panel-elevated)] p-5 sm:p-6 text-left flex items-center gap-5">
            <div className="relative w-20 h-28 sm:w-24 sm:h-32 rounded-2xl overflow-hidden bg-[var(--panel-elevated)] shadow-xl shrink-0">
              {watchlist[0]?.posterUrl ? <Image src={watchlist[0].posterUrl} alt="" fill sizes="96px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[var(--accent)]"><Bookmark size={31} className="fill-current" /></div>}
            </div>
            <div className="min-w-0"><p className="eyebrow">Saved for later</p><h3 className="text-2xl font-black tracking-tight mt-1">Your watchlist</h3><p className="text-xs text-[var(--text-muted)] mt-1">{watchlist.length} title{watchlist.length === 1 ? '' : 's'} waiting</p></div>
            {watchlist.length > 0 && <span onClick={(event) => { event.stopPropagation(); playItem(watchlist[0], watchlist); }} className="ml-auto w-12 h-12 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0"><Play size={19} className="fill-current ml-0.5" /></span>}
          </button>

          <div className="grid sm:grid-cols-3 gap-3">
            <QuickCard icon={<Clock3 size={20} />} title="Watch history" count={`${recentItems.length} titles`} onClick={() => setSection('history')} />
            <QuickCard icon={<ListPlus size={20} />} title="Personal lists" count={`${collections.length} lists`} onClick={() => setSection('lists')} />
            <QuickCard icon={<Download size={20} />} title="Offline videos" count={`${downloads.length} saved${storage?.videosBytes ? ` • ${formatBytes(storage.videosBytes)}` : ''}`} onClick={() => setSection('downloads')} />
          </div>

          {continueWatching.length > 0 && (
            <section><div className="section-heading"><div><p className="eyebrow">Resume</p><h3>Continue watching</h3></div></div><div className="media-grid-scroll mt-4">{continueWatching.slice(0, 10).map((item) => <MediaCard key={item.id} item={item} onOpen={onOpen} onPlay={() => playItem(item, continueWatching)} />)}</div></section>
          )}

          {recentItems.length > 0 && (
            <section><div className="section-heading"><div><p className="eyebrow">Recently opened</p><h3>Back to your stories</h3></div><button onClick={() => setSection('history')} className="small-pill">See all</button></div><div className="mt-3 space-y-1">{recentItems.slice(0, 5).map((item) => <MediaRow key={item.id} item={item} onOpen={() => onOpen(item)} onPlay={() => playItem(item, recentItems)} />)}</div></section>
          )}
        </div>
      )}

      {section === 'watchlist' && (
        <LibrarySection title={`Watchlist (${filteredWatchlist.length})`} empty="Nothing saved yet. Add a title with the bookmark button." isEmpty={filteredWatchlist.length === 0}>
          <div className="responsive-media-grid">{filteredWatchlist.map((item) => <MediaCard key={item.id} item={item} onOpen={onOpen} onPlay={() => playItem(item, filteredWatchlist)} />)}</div>
        </LibrarySection>
      )}

      {section === 'history' && (
        <LibrarySection title={`History (${filteredHistory.length})`} empty="Your recently opened titles will appear here." isEmpty={filteredHistory.length === 0}>
          <div className="space-y-1">{filteredHistory.map((item) => <MediaRow key={item.id} item={item} onOpen={() => onOpen(item)} onPlay={() => playItem(item, filteredHistory)} />)}</div>
        </LibrarySection>
      )}

      {section === 'lists' && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Curated by you</p><h3 className="text-xl font-black">Personal lists</h3></div><button onClick={() => setShowCreate(!showCreate)} className="secondary-button"><Plus size={16} />New list</button></div>
          {showCreate && <div className="flex gap-2 mt-4"><input value={newList} onChange={(event) => setNewList(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && create()} placeholder="List name" className="field flex-1" /><button onClick={create} className="primary-button">Create</button></div>}
          {!collections.length ? <EmptyState icon={<ListPlus size={27} />} text="Create a list for movie nights, favorites, or anything else." /> : (
            <div className="grid md:grid-cols-2 gap-4 mt-5">
              {collections.map((collection) => (
                <article key={collection.id} className="rounded-[26px] border border-[var(--line)] bg-[var(--panel)] p-4">
                  <div className="flex items-start justify-between"><div><h4 className="font-black">{collection.title}</h4><p className="text-[10px] text-[var(--text-faint)] mt-0.5">{collection.items.length} title{collection.items.length === 1 ? '' : 's'}</p></div><button onClick={() => deleteCollection(collection.id)} className="icon-button !w-8 !h-8 hover:!text-red-500"><Trash2 size={15} /></button></div>
                  {collection.items.length ? <div className="mt-3 space-y-1">{collection.items.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-[var(--panel-elevated)]"><button onClick={() => onOpen(item)} className="flex-1 min-w-0 text-left"><span className="block text-xs font-bold truncate">{item.title}</span><span className="block text-[9px] text-[var(--text-faint)]">{item.year}</span></button><button onClick={() => playItem(item, collection.items)} className="text-[var(--accent)]"><Play size={15} className="fill-current" /></button><button onClick={() => removeFromCollection(collection.id, item.id)} className="text-[var(--text-faint)] hover:text-red-500"><Trash2 size={14} /></button></div>)}</div> : <p className="text-xs text-[var(--text-muted)] mt-4 py-4 text-center border border-dashed border-[var(--line)] rounded-2xl">Open a title and choose “Add to list”.</p>}
                  {collection.items.length > 4 && <p className="text-[10px] text-[var(--text-faint)] text-center mt-2">+{collection.items.length - 4} more</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'downloads' && (
        <div className="mt-6">
          <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">On this device</p><h3 className="text-xl font-black">Offline downloads</h3><p className="text-xs text-[var(--text-muted)] mt-1">{storage ? `${formatBytes(storage.videosBytes)} used${storage.quota ? ` of ${formatBytes(storage.quota)}` : ''}` : 'Calculating storage…'}</p></div><HardDrive size={22} className="text-[var(--accent)]" /></div>
          {!isOnline && downloads.length > 0 && <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3 flex items-center gap-2 text-xs font-bold text-[var(--accent)]"><WifiOff size={15} />Offline mode — local videos remain playable.</div>}
          {!downloads.length ? <EmptyState icon={<Download size={27} />} text="Licensed direct videos you save will be available here without internet." /> : (
            <div className="mt-5 space-y-2">
              {downloads.map((download) => {
                const item = download.item;
                return (
                  <div key={download.id} className="flex items-center gap-3 p-2.5 rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                    <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-[var(--panel-elevated)] shrink-0">{(covers.get(download.id) || item.posterUrl) && <Image src={(covers.get(download.id) || item.posterUrl)!} alt={item.title} fill sizes="64px" className="object-cover" />}</div>
                    <button onClick={() => playItem(item, downloads.map((entry) => entry.item))} className="min-w-0 flex-1 text-left"><h4 className="text-sm font-black truncate">{item.title}</h4><p className="text-[10px] text-[var(--text-faint)] mt-1">{formatBytes(download.fileSize)} • Saved {new Date(download.downloadedAt).toLocaleDateString()}</p></button>
                    <button onClick={() => playItem(item, downloads.map((entry) => entry.item))} className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center"><Play size={16} className="fill-current" /></button>
                    <button onClick={() => deleteDownloadedVideo(download.id).then(() => { refresh(); refreshStorage(); })} className="icon-button hover:!text-red-500"><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickCard({ icon, title, count, onClick }: { icon: React.ReactNode; title: string; count: string; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-4 flex items-center gap-3 text-left hover:border-[var(--accent)]/40 transition"><span className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">{icon}</span><span className="min-w-0"><span className="block text-sm font-black truncate">{title}</span><span className="block text-[10px] text-[var(--text-faint)] truncate mt-0.5">{count}</span></span></button>;
}

function LibrarySection({ title, empty, isEmpty, children }: { title: string; empty: string; isEmpty: boolean; children: React.ReactNode }) {
  return <section className="mt-6"><h3 className="text-xl font-black">{title}</h3>{isEmpty ? <EmptyState icon={<Film size={27} />} text={empty} /> : <div className="mt-4">{children}</div>}</section>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="mt-5 min-h-44 rounded-[26px] border-2 border-dashed border-[var(--line)] flex flex-col items-center justify-center gap-3 text-center p-6 text-[var(--text-faint)]"><span className="w-14 h-14 rounded-2xl bg-[var(--panel)] flex items-center justify-center">{icon}</span><p className="text-xs max-w-sm">{text}</p></div>;
}
