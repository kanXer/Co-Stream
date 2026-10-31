'use client';

import React, { useCallback, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { PlaybackAudioTrack, PlaybackQuality, PlaybackSubtitle } from '@/types';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface PlayerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playbackSpeed: number;
  onSelectSpeed: (speed: number) => void;
  videoFit: 'contain' | 'cover' | 'fill';
  onSelectFit: (fit: 'contain' | 'cover' | 'fill') => void;
  selectedQuality: string;
  hlsLevels: Array<{ id: number; label: string; height: number; bitrate?: number }>;
  qualities?: PlaybackQuality[];
  onSelectQuality: (label: string, url: string, hlsLevelIndex?: number) => void;
  hlsAudioTracks: Array<{ id: number; label: string }>;
  sourceAudioTracks?: PlaybackAudioTrack[];
  selectedAudio: string;
  onSelectHlsAudio: (trackId: number, label: string) => void;
  onSelectSourceAudio: (resolveUrl: string) => void;
  subtitles?: PlaybackSubtitle[];
  selectedSubtitle: string;
  onSelectSubtitle: (id: string) => void;
}

export const PlayerSettingsModal = React.memo(function PlayerSettingsModal({
  isOpen,
  onClose,
  playbackSpeed,
  onSelectSpeed,
  videoFit,
  onSelectFit,
  selectedQuality,
  hlsLevels,
  qualities,
  onSelectQuality,
  hlsAudioTracks,
  sourceAudioTracks,
  selectedAudio,
  onSelectHlsAudio,
  onSelectSourceAudio,
  subtitles,
  selectedSubtitle,
  onSelectSubtitle,
}: PlayerSettingsModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleContainerTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleContainerWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const isScrollingUp = e.deltaY < 0;
    const isScrollingDown = e.deltaY > 0;
    const isAtTop = el.scrollTop <= 0;
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
      e.preventDefault();
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="player-controls-menu pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(3.8rem,calc(env(safe-area-inset-top)+3rem))] w-72 sm:w-80 max-h-[75%] overflow-y-auto rounded-2xl border border-white/15 bg-[#0e1315]/95 p-3 shadow-2xl backdrop-blur-2xl z-40 text-white select-none overscroll-contain touch-pan-y"
      style={{
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={handleContainerWheel}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 py-1 border-b border-white/10 mb-2">
        <h3 className="text-xs uppercase tracking-[.18em] font-black text-[#7fffd2]">
          Playback settings
        </h3>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition active:scale-95"
          title="Close settings"
        >
          <X size={15} />
        </button>
      </div>

      {/* Section: Playback Speed */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Speed</p>
        <div className="grid grid-cols-6 gap-1">
          {SPEED_OPTIONS.map((speed) => (
            <button
              type="button"
              key={speed}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSpeed(speed);
              }}
              className={`py-1.5 rounded-lg text-xs font-bold text-center border transition ${
                playbackSpeed === speed
                  ? 'bg-[#7fffd2] text-black border-transparent shadow-[0_2px_8px_rgba(127,255,210,0.3)]'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      {/* Section: Picture Fit */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Picture</p>
        <div className="grid grid-cols-3 gap-1">
          {(['contain', 'cover', 'fill'] as const).map((fit) => (
            <button
              type="button"
              key={fit}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFit(fit);
              }}
              className={`py-1.5 rounded-lg text-xs font-bold text-center border capitalize transition ${
                videoFit === fit
                  ? 'bg-[#7fffd2] text-black border-transparent shadow-[0_2px_8px_rgba(127,255,210,0.3)]'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
              }`}
            >
              {fit === 'contain' ? 'Fit' : fit === 'cover' ? 'Fill' : 'Stretch'}
            </button>
          ))}
        </div>
      </div>

      {/* Section: Quality (Fully Functional HLS.js / HTML5) */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Quality</p>
        <div className="space-y-1">
          {/* Always provide Auto (Adaptive) option */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectQuality('Auto', '', -1);
            }}
            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
              selectedQuality === 'Auto'
                ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                : 'hover:bg-white/10 text-white/80'
            }`}
          >
            <span>Auto (Adaptive)</span>
            {selectedQuality === 'Auto' && <Check size={14} className="text-[#7fffd2]" />}
          </button>

          {/* Render HLS levels if available */}
          {hlsLevels.length > 0 ? (
            hlsLevels.map((lvl) => (
              <button
                type="button"
                key={`hls-${lvl.id}-${lvl.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectQuality(lvl.label, '', lvl.id);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                  selectedQuality === lvl.label
                    ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                    : 'hover:bg-white/10 text-white/80'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {lvl.label}
                  {lvl.height >= 1080 && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-[#7fffd2]/20 text-[#7fffd2]">
                      HD
                    </span>
                  )}
                  {lvl.height === 480 && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-white/10 text-white/50">
                      SD
                    </span>
                  )}
                </span>
                {selectedQuality === lvl.label && <Check size={14} className="text-[#7fffd2]" />}
              </button>
            ))
          ) : qualities && qualities.length > 0 ? (
            qualities.map((quality) => (
              <button
                type="button"
                key={`direct-${quality.label}-${quality.url}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectQuality(quality.label, quality.url);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                  selectedQuality === quality.label
                    ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                    : 'hover:bg-white/10 text-white/80'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {quality.label}
                  {quality.label.includes('1080') && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-[#7fffd2]/20 text-[#7fffd2]">
                      HD
                    </span>
                  )}
                  {quality.label.includes('480') && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-white/10 text-white/50">
                      SD
                    </span>
                  )}
                </span>
                {selectedQuality === quality.label && <Check size={14} className="text-[#7fffd2]" />}
              </button>
            ))
          ) : null}
        </div>
      </div>

      {/* Section: Audio */}
      {((sourceAudioTracks && sourceAudioTracks.length > 0) || hlsAudioTracks.length > 0) && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Audio</p>
          <div className="space-y-1">
            {hlsAudioTracks.length > 0 ? (
              hlsAudioTracks.map((track) => (
                <button
                  type="button"
                  key={`hls-audio-${track.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectHlsAudio(track.id, track.label);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                    selectedAudio === track.label
                      ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                      : 'hover:bg-white/10 text-white/80'
                  }`}
                >
                  <span>{track.label}</span>
                  {selectedAudio === track.label && <Check size={14} className="text-[#7fffd2]" />}
                </button>
              ))
            ) : (
              sourceAudioTracks?.map((track) => (
                <button
                  type="button"
                  key={`src-audio-${track.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSourceAudio(track.resolveUrl);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                    selectedAudio === track.label
                      ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                      : 'hover:bg-white/10 text-white/80'
                  }`}
                >
                  <span>{track.label}</span>
                  {selectedAudio === track.label && <Check size={14} className="text-[#7fffd2]" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Section: Subtitles */}
      {subtitles && subtitles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Subtitles</p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSubtitle('off');
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                selectedSubtitle === 'off'
                  ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                  : 'hover:bg-white/10 text-white/80'
              }`}
            >
              <span>Off</span>
              {selectedSubtitle === 'off' && <Check size={14} className="text-[#7fffd2]" />}
            </button>
            {subtitles.map((track) => (
              <button
                type="button"
                key={`sub-${track.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSubtitle(track.id);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                  selectedSubtitle === track.id
                    ? 'bg-[#7fffd2]/15 text-[#7fffd2] border border-[#7fffd2]/30'
                    : 'hover:bg-white/10 text-white/80'
                }`}
              >
                <span>{track.label}</span>
                {selectedSubtitle === track.id && <Check size={14} className="text-[#7fffd2]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
