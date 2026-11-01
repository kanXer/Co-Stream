'use client';

import React from 'react';
import Image from 'next/image';
import { Bookmark, Check, Download, Moon, Play, Share2, Sun } from 'lucide-react';
import type { MediaItem, PlaybackSource } from '@/types';

export interface PlayerSidebarDetailsProps {
  currentItem: MediaItem;
  source: PlaybackSource | null;
  selectedAudio: string;
  saved: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  themeMode: string;
  relatedItems: MediaItem[];
  queue: MediaItem[];
  queueIndex: number;
  showQueue: boolean;
  onToggleWatchlist: () => void;
  onOfflineAction: () => void;
  onShare: () => void;
  onCycleTheme: () => void;
  onPlayItem: (item: MediaItem, queue?: MediaItem[]) => void;
}

export const PlayerSidebarDetails = React.memo(function PlayerSidebarDetails({
  currentItem,
  source,
  selectedAudio,
  saved,
  isDownloaded,
  isDownloading,
  themeMode,
  relatedItems,
  queue,
  queueIndex,
  showQueue,
  onToggleWatchlist,
  onOfflineAction,
  onShare,
  onCycleTheme,
  onPlayItem,
}: PlayerSidebarDetailsProps) {
  return (
    <aside className="min-w-0">
      <div className="watch-glass rounded-[26px] p-5 lg:sticky lg:top-24">
        <div className="flex items-start gap-3.5">
          <div className="watch-poster relative w-16 h-24 rounded-xl overflow-hidden shrink-0">
            {currentItem.posterUrl && (
              <Image src={currentItem.posterUrl} alt={currentItem.title} fill sizes="64px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 pt-1">
            <p className="watch-accent text-[9px] uppercase tracking-[.18em] font-black">
              {source?.label || 'Co-Stream'}
              {selectedAudio !== 'Original' ? ` • ${selectedAudio}` : ''}
            </p>
            <h2 className="text-lg font-black leading-tight mt-1 line-clamp-2">{currentItem.title}</h2>
            <p className="watch-muted text-[11px] mt-1">
              {currentItem.year} • {(currentItem.genres || []).slice(0, 2).join(' • ')}
            </p>
          </div>
        </div>

        <p className="watch-muted mt-4 text-xs leading-6 line-clamp-5">{currentItem.overview}</p>

        <div className="grid grid-cols-4 gap-2.5 mt-4">
          <button
            type="button"
            onClick={onToggleWatchlist}
            className={`h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 border cursor-pointer ${
              saved
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/50 shadow-lg'
                : 'bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[var(--text)] dark:text-white border-[var(--line)] dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.2)]'
            }`}
            title={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
          >
            <Bookmark size={20} strokeWidth={2.2} className={saved ? 'fill-current text-[var(--accent)]' : 'text-current'} />
          </button>
          <button
            type="button"
            onClick={onOfflineAction}
            className={`h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 border cursor-pointer ${
              isDownloaded
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/50 shadow-lg'
                : 'bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[var(--text)] dark:text-white border-[var(--line)] dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.2)]'
            }`}
            title={isDownloaded ? 'Saved offline' : isDownloading ? 'Downloading...' : 'Save offline'}
          >
            {isDownloaded ? (
              <Check size={20} strokeWidth={2.5} className="text-[var(--accent)]" />
            ) : isDownloading ? (
              <span className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            ) : (
              <Download size={20} strokeWidth={2.2} className="text-current" />
            )}
          </button>
          <button
            type="button"
            onClick={onShare}
            className="h-12 rounded-2xl flex items-center justify-center bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[var(--text)] dark:text-white border border-[var(--line)] dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all duration-200 active:scale-95 cursor-pointer"
            title="Share title"
          >
            <Share2 size={20} strokeWidth={2.2} className="text-current" />
          </button>
          <button
            type="button"
            onClick={onCycleTheme}
            className="h-12 rounded-2xl flex items-center justify-center bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[var(--text)] dark:text-white border border-[var(--line)] dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all duration-200 active:scale-95 cursor-pointer"
            title="Toggle theme"
          >
            {themeMode === 'DARK' ? (
              <Sun size={20} strokeWidth={2.2} className="text-current" />
            ) : (
              <Moon size={20} strokeWidth={2.2} className="text-current" />
            )}
          </button>
        </div>

        {/* ── Related Movies / Recommendations ─────────────────── */}
        {relatedItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--line)]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black tracking-wide text-[var(--text)] dark:text-white">
                {currentItem.mediaType === 'tv' ? 'Related Series' : 'Related Movies'}
              </p>
              <span className="watch-muted text-[10px] font-bold">Recommended</span>
            </div>
            <div className="space-y-2 max-h-[340px] overflow-y-auto no-scrollbar pr-0.5">
              {relatedItems.map((movie) => (
                <div
                  key={movie.id}
                  onClick={() => onPlayItem(movie, [movie, ...relatedItems])}
                  className="group flex items-center gap-3 p-2 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.09] border border-[var(--line)]/50 dark:border-white/5 transition-all duration-200 cursor-pointer active:scale-[0.98]"
                >
                  <div className="watch-poster relative w-12 h-16 rounded-xl overflow-hidden shrink-0 dark:bg-white/5 shadow-md">
                    {movie.posterUrl ? (
                      <Image
                        src={movie.posterUrl}
                        alt={movie.title}
                        fill
                        sizes="48px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--text-faint)]">🎬</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition truncate">
                      {movie.title}
                    </h4>
                    <p className="watch-muted text-[10px] mt-0.5 font-medium truncate">
                      {movie.year} {movie.rating ? `• ★ ${Number(movie.rating).toFixed(1)}` : ''}
                    </p>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)] flex items-center justify-center transition-all duration-200 shrink-0">
                    <Play size={13} className="fill-current ml-0.5" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentItem.mediaType !== 'tv' && (showQueue || queue.length > 1) && (
          <div className="mt-5 pt-4 border-t border-[var(--line)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black">Up next</p>
              <span className="watch-muted text-[9px]">
                {queueIndex + 1} / {queue.length}
              </span>
            </div>
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto no-scrollbar">
              {queue.map((entry, index) => (
                <div
                  key={`${entry.id}-${index}`}
                  className={`watch-queue-item flex items-center gap-2.5 p-2 rounded-xl ${
                    index === queueIndex ? 'active' : ''
                  }`}
                >
                  <div className="watch-poster relative w-8 h-11 rounded-lg overflow-hidden shrink-0">
                    {entry.posterUrl && <Image src={entry.posterUrl} alt="" fill sizes="32px" className="object-cover" />}
                  </div>
                  <span className="text-[11px] font-bold truncate flex-1">{entry.title}</span>
                  {index === queueIndex && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});
