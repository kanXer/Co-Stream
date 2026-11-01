'use client';

import React from 'react';
import Image from 'next/image';
import { Bookmark, Film, Play, Star } from 'lucide-react';
import { useStream, journeyKey } from '@/context/StreamContext';
import { prefetchNetMirrorPlayback } from '@/lib/playbackClient';
import type { MediaItem } from '@/types';

export function MediaCard({
  item,
  onOpen,
  onPlay,
  rank,
}: {
  item: MediaItem;
  onOpen: (item: MediaItem) => void;
  onPlay?: (item: MediaItem) => void;
  rank?: number;
}) {
  const { isWatchlisted, toggleWatchlist, watchProgress } = useStream();
  const saved = isWatchlisted(item.id);
  const key = journeyKey(item);
  const progress = watchProgress[item.id] || watchProgress[key];
  const progressPercent = progress?.duration ? Math.min(100, (progress.position / progress.duration) * 100) : 0;

  return (
    <article
      className="media-card group"
      onPointerEnter={() => prefetchNetMirrorPlayback(item)}
      onFocusCapture={() => prefetchNetMirrorPlayback(item)}
      onTouchStart={() => prefetchNetMirrorPlayback(item)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(item); }}
        className="block text-left w-full cursor-pointer"
      >
        <div className="relative aspect-[2/3] rounded-[22px] overflow-hidden bg-[var(--panel)] border border-[var(--line)] shadow-[0_12px_30px_rgba(0,0,0,.13)]">
          {item.posterUrl ? (
            <Image src={item.posterUrl} alt={item.title} fill sizes="(max-width: 640px) 42vw, 176px" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--panel-elevated)] to-[var(--panel)]"><Film size={35} className="text-[var(--accent)]/60" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 opacity-80" />
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-lg bg-black/60 backdrop-blur-md px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
            {item.mediaType === 'tv'
              ? (item.selectedSeason ? `S${item.selectedSeason} E${item.selectedEpisode || 1}` : 'Series')
              : 'Movie'}
          </span>
          {rank !== undefined && (
            <span className="absolute bottom-1 left-1 text-[56px] leading-none font-black tracking-[-0.08em] text-white drop-shadow-[0_4px_0_rgba(0,0,0,.55)]">{rank}</span>
          )}
          <button
            onClick={(event) => { event.stopPropagation(); toggleWatchlist(item); }}
            title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
            className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition ${saved ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-black/55 text-white'}`}
          >
            <Bookmark size={15} className={saved ? 'fill-current' : ''} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); (onPlay || onOpen)(item); }}
            className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-xl transition group-hover:scale-110"
            title="Play"
          >
            <Play size={17} className="fill-current ml-0.5" />
          </button>
          {progressPercent > 0 && (
            <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-[var(--accent)]" style={{ width: `${progressPercent}%` }} /></div>
          )}
        </div>
      </div>
      <button onClick={() => onOpen(item)} className="block text-left w-full mt-2.5">
        <h3 className="text-[13px] font-black truncate group-hover:text-[var(--accent)] transition-colors">{item.title}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] truncate">
          {item.mediaType === 'tv' && item.selectedSeason ? (
            <span className="text-[var(--accent)] font-bold">
              S{item.selectedSeason} · E{item.selectedEpisode || 1}
            </span>
          ) : (
            <span>{item.year}</span>
          )}
          {item.rating > 0 && <><span>•</span><Star size={10} className="text-amber-500 fill-amber-500" /><span>{item.rating.toFixed(1)}</span></>}
        </p>
      </button>
    </article>
  );
}

export function MediaRow({ item, onOpen, onPlay }: { item: MediaItem; onOpen: () => void; onPlay: () => void }) {
  const { isWatchlisted, toggleWatchlist } = useStream();
  const saved = isWatchlisted(item.id);
  return (
    <div onClick={onOpen} onPointerEnter={() => prefetchNetMirrorPlayback(item)} onTouchStart={() => prefetchNetMirrorPlayback(item)} className="flex items-center gap-3 p-2 rounded-2xl border border-transparent hover:border-[var(--line)] hover:bg-[var(--panel)] cursor-pointer transition">
      <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-[var(--panel)] shrink-0">
        {item.posterUrl ? <Image src={item.posterUrl} alt={item.title} fill sizes="64px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={18} /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-black truncate">{item.title}</h4>
        <p className="text-[11px] text-[var(--text-muted)] truncate mt-1">
          {item.mediaType === 'tv' && item.selectedSeason
            ? `S${item.selectedSeason} E${item.selectedEpisode || 1}`
            : item.year} • {(item.genres || []).slice(0, 2).join(', ') || (item.mediaType === 'tv' ? 'Series' : 'Movie')}
        </p>
        {item.rating > 0 && <p className="text-[10px] text-amber-500 font-bold mt-1">★ {item.rating.toFixed(1)}</p>}
      </div>
      <button onClick={(event) => { event.stopPropagation(); toggleWatchlist(item); }} className={`icon-button ${saved ? '!text-[var(--accent)]' : ''}`}><Bookmark size={17} className={saved ? 'fill-current' : ''} /></button>
      <button onClick={(event) => { event.stopPropagation(); onPlay(); }} className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0"><Play size={16} className="fill-current ml-0.5" /></button>
    </div>
  );
}
