'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export interface CinemaScrubberProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  bufferedEnd: number;
  title: string;
  showControls: boolean;
  playerMenuOpen: boolean;
  onSeek: (seconds: number) => void;
  onScrubStateChange?: (isScrubbing: boolean) => void;
  onRevealControls?: () => void;
}

export const CinemaScrubber = React.memo(function CinemaScrubber({
  videoRef,
  duration,
  bufferedEnd,
  title,
  showControls,
  playerMenuOpen,
  onSeek,
  onScrubStateChange,
  onRevealControls,
}: CinemaScrubberProps) {
  const [displayTime, setDisplayTime] = useState(0);
  const [scrubbingTime, setScrubbingTime] = useState<number | null>(null);

  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  // Directly listen to video element time updates so the outer player doesn't re-render
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTime = () => {
      if (!isScrubbingRef.current) {
        setDisplayTime(video.currentTime);
      }
    };

    video.addEventListener('timeupdate', handleTime, { passive: true });
    video.addEventListener('seeking', handleTime, { passive: true });
    video.addEventListener('seeked', handleTime, { passive: true });
    video.addEventListener('loadedmetadata', handleTime, { passive: true });

    return () => {
      video.removeEventListener('timeupdate', handleTime);
      video.removeEventListener('seeking', handleTime);
      video.removeEventListener('seeked', handleTime);
      video.removeEventListener('loadedmetadata', handleTime);
    };
  }, [videoRef]);

  const calculateScrubTarget = useCallback((clientX: number) => {
    const el = scrubberRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return duration * fraction;
  }, [duration]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    isScrubbingRef.current = true;
    onScrubStateChange?.(true);
    const target = calculateScrubTarget(event.clientX);
    setScrubbingTime(target);
    onRevealControls?.();
  }, [calculateScrubTarget, onRevealControls, onScrubStateChange]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    const clientX = event.clientX;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const target = calculateScrubTarget(clientX);
      setScrubbingTime(target);
    });
    onRevealControls?.();
  }, [calculateScrubTarget, onRevealControls]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    isScrubbingRef.current = false;
    onScrubStateChange?.(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    const target = calculateScrubTarget(event.clientX);
    setScrubbingTime(null);
    setDisplayTime(target);
    onSeek(target);
    onRevealControls?.();
  }, [calculateScrubTarget, onRevealControls, onScrubStateChange, onSeek]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    isScrubbingRef.current = false;
    onScrubStateChange?.(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setScrubbingTime(null);
  }, [onScrubStateChange]);

  const activePosition = scrubbingTime ?? displayTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (activePosition / duration) * 100)) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0;

  return (
    <div
      className={`player-bottom-bar player-gpu-layer absolute inset-x-0 bottom-0 pt-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-[max(1.25rem,max(env(safe-area-inset-left),env(safe-area-inset-right)))] bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-200 ${
        showControls || playerMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Timestamps */}
      <div className="flex items-center justify-between text-xs font-bold text-white mb-2 tabular-nums">
        <span className="text-[#7fffd2] drop-shadow-[0_1px_6px_rgba(127,255,210,0.4)]">
          {formatTime(activePosition)}
        </span>
        <span className="text-white/60">{formatTime(duration)}</span>
      </div>

      {/* Cinema Scrubber with full drag and touch support */}
      <div
        ref={scrubberRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative h-10 -my-2 flex items-center cursor-pointer group select-none touch-none"
      >
        {/* Floating Scrub Badge */}
        {scrubbingTime !== null && (
          <div
            className="player-gpu-layer absolute -top-8 px-2.5 py-1 rounded-md bg-[#0e1315]/95 border border-[#7fffd2]/40 text-[#7fffd2] text-[11px] font-black pointer-events-none shadow-2xl tracking-wider backdrop-blur-md"
            style={{
              left: `${progressPercent}%`,
              transform: 'translate3d(-50%, 0, 0)',
            }}
          >
            {formatTime(scrubbingTime)}
          </div>
        )}

        <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden relative transition-[height] group-hover:h-2.5">
          {/* Buffered bar */}
          <div
            className="player-gpu-layer absolute inset-y-0 left-0 bg-white/30 rounded-full transition-[width] duration-300"
            style={{ width: `${bufferedPercent}%` }}
          />
          {/* Gradient progress bar */}
          <div
            className="player-gpu-layer absolute inset-y-0 left-0 bg-gradient-to-r from-[#7fffd2] to-[#3b82f6] rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className={`player-gpu-layer absolute top-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-2xl border border-white/40 ring-4 ring-[#7fffd2]/30 transition-transform ${
            scrubbingTime !== null ? 'scale-125 ring-[#7fffd2]/60' : 'group-hover:scale-125'
          }`}
          style={{
            left: `${progressPercent}%`,
            transform: 'translate3d(-50%, -50%, 0)',
          }}
        />
      </div>

      {/* Footer branding */}
      <div className="flex items-center justify-between mt-2.5 px-0.5 text-[9px] font-bold text-white/45 uppercase tracking-wider">
        <span className="truncate max-w-[65%]">{title}</span>
        <span className="tracking-[0.2em] font-black text-white/40">CO-STREAM PLAYER</span>
      </div>
    </div>
  );
});
