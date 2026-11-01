'use client';

import React from 'react';
import {
  Bookmark,
  ChevronLeft,
  EyeOff,
  Lock,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Settings2,
  SkipForward,
} from 'lucide-react';
import type { MediaEpisode, MediaItem, PlaybackSource } from '@/types';

export interface PlayerTopBarProps {
  showControls: boolean;
  playerMenu: string | null;
  currentItem: MediaItem;
  source: PlaybackSource | null;
  contextSubtitle: string;
  playbackSpeed: number;
  isSeries: boolean;
  nextEpisode: MediaEpisode | null;
  saved: boolean;
  pipSupported: boolean;
  isBrowserFullscreen: boolean;
  onMinimize: () => void;
  onCycleSpeed: () => void;
  onPlayNextEpisode: () => void;
  onToggleWatchlist: () => void;
  onTogglePip: () => void;
  onHideControls: () => void;
  onToggleMenu: () => void;
  onToggleFullscreen: () => void;
  onLock: () => void;
}

export const PlayerTopBar = React.memo(function PlayerTopBar({
  showControls,
  playerMenu,
  currentItem,
  source,
  contextSubtitle,
  playbackSpeed,
  isSeries,
  nextEpisode,
  saved,
  pipSupported,
  isBrowserFullscreen,
  onMinimize,
  onCycleSpeed,
  onPlayNextEpisode,
  onToggleWatchlist,
  onTogglePip,
  onHideControls,
  onToggleMenu,
  onToggleFullscreen,
  onLock,
}: PlayerTopBarProps) {
  const isInteractive = showControls || Boolean(playerMenu);

  return (
    <>
      <div
        className={`player-controls-top player-gpu-layer absolute inset-x-0 top-0 pt-[max(0.75rem,env(safe-area-inset-top))] px-[max(1rem,max(env(safe-area-inset-left),env(safe-area-inset-right)))] pb-10 bg-gradient-to-b from-black/90 via-black/45 to-transparent flex flex-wrap items-center justify-between gap-x-2 gap-y-1 max-w-full transition-opacity duration-200 ${
          isInteractive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Top-Left: Back + Title & Subtitle */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95 shrink-0"
            title="Minimize player"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-[36vw] sm:max-w-[44vw]">
              {currentItem.title}
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-white/60 font-medium truncate mt-0.5">
              {source?.kind === 'youtube' ? (
                <span className="text-[#7fffd2] font-bold">Official Trailer</span>
              ) : (
                <span>{contextSubtitle}</span>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right: Controls */}
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 shrink-0">
          {/* Playback speed badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCycleSpeed();
            }}
            className="px-2 sm:px-3 py-1.5 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] sm:text-xs font-bold text-white backdrop-blur-md transition active:scale-95"
            title="Click to cycle speed"
          >
            {playbackSpeed}×
          </button>

          {/* Next episode (Series only) */}
          {isSeries && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlayNextEpisode();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-[#7fffd2]/15 hover:bg-[#7fffd2]/25 border border-[#7fffd2]/30 flex items-center justify-center text-[#7fffd2] backdrop-blur-md transition active:scale-95"
              title={nextEpisode ? `Next: Episode ${nextEpisode.number}` : 'Next Episode'}
            >
              <SkipForward size={18} className="fill-current" />
            </button>
          )}

          {/* Bookmark */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist();
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center backdrop-blur-md transition active:scale-95 ${
              saved ? 'text-[#7fffd2]' : 'text-white'
            }`}
            title={saved ? 'Remove from My List' : 'Add to My List'}
          >
            <Bookmark size={18} className={saved ? 'fill-current' : ''} />
          </button>

          {/* PiP */}
          {pipSupported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePip();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 hidden sm:flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
              title="Picture in Picture"
            >
              <PictureInPicture2 size={18} />
            </button>
          )}

          {/* Clean View Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHideControls();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
            title="Clean View (Hide all controls)"
          >
            <EyeOff size={18} />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95 ${
              playerMenu ? '!bg-white/25 border-[#7fffd2]' : ''
            }`}
            title="Playback settings"
          >
            <Settings2 size={18} />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullscreen();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
            title="Toggle fullscreen"
          >
            {isBrowserFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Lock Button (CenterEnd - Fullscreen) */}
      <div
        className={`player-gpu-layer absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2 z-20 transition-opacity duration-200 ${
          isInteractive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLock();
          }}
          className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center text-white/80 hover:text-white backdrop-blur-md transition active:scale-95 shadow-xl"
          title="Lock player controls"
        >
          <Lock size={18} />
        </button>
      </div>
    </>
  );
});
