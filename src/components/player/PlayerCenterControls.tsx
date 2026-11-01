'use client';

import React from 'react';
import { FastForward, Pause, Play, Rewind, RotateCw } from 'lucide-react';

export interface PlayerCenterControlsProps {
  showControls: boolean;
  playerMenuOpen: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  switchingSource: boolean;
  isEnded: boolean;
  onTogglePlay: () => void;
  onSeekBy: (delta: number) => void;
}

export const PlayerCenterControls = React.memo(function PlayerCenterControls({
  showControls,
  playerMenuOpen,
  isPlaying,
  isLoading,
  switchingSource,
  isEnded,
  onTogglePlay,
  onSeekBy,
}: PlayerCenterControlsProps) {
  const isInteractive = showControls || playerMenuOpen;

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-6 sm:gap-9 pointer-events-none">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSeekBy(-10);
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className={`player-gpu-layer ${
          isInteractive ? 'pointer-events-auto' : 'pointer-events-none'
        } relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition active:scale-90 shadow-2xl`}
        title="Rewind 10 seconds"
      >
        <Rewind size={24} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        disabled={switchingSource}
        className={`player-gpu-layer ${
          isInteractive ? 'pointer-events-auto' : 'pointer-events-none'
        } w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white hover:bg-white/95 text-black flex items-center justify-center shadow-2xl transition-transform active:scale-90 disabled:opacity-60`}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {switchingSource ? (
          <span className="w-7 h-7 rounded-full border-3 border-black/25 border-t-black animate-spin" />
        ) : isEnded ? (
          <RotateCw size={30} className="stroke-[2.5]" />
        ) : isPlaying ? (
          <Pause size={32} className="fill-current" />
        ) : (
          <Play size={32} className="fill-current ml-1" />
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSeekBy(10);
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className={`player-gpu-layer ${
          isInteractive ? 'pointer-events-auto' : 'pointer-events-none'
        } relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition active:scale-90 shadow-2xl`}
        title="Forward 10 seconds"
      >
        <FastForward size={24} />
      </button>
    </div>
  );
});
