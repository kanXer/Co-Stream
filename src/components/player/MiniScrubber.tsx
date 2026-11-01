'use client';

import React, { useEffect, useState } from 'react';

export interface MiniScrubberProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoSessionKey?: string;
  duration: number;
  onSeek: (seconds: number) => void;
}

export const MiniScrubber = React.memo(function MiniScrubber({
  videoRef,
  videoSessionKey,
  duration,
  onSeek,
}: MiniScrubberProps) {
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTime = () => setDisplayTime(video.currentTime);
    video.addEventListener('timeupdate', handleTime, { passive: true });
    video.addEventListener('seeking', handleTime, { passive: true });
    video.addEventListener('seeked', handleTime, { passive: true });

    return () => {
      video.removeEventListener('timeupdate', handleTime);
      video.removeEventListener('seeking', handleTime);
      video.removeEventListener('seeked', handleTime);
    };
  }, [videoRef, videoSessionKey]);

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

  return (
    <div className="relative z-10 border-t border-[var(--line)] bg-[var(--accent-soft)] px-2.5 pb-2.5 pt-2">
      <div
        className="h-1.5 rounded-full overflow-hidden bg-[var(--line)] relative cursor-pointer"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
          onSeek((duration || 1) * percent);
        }}
      >
        <div
          className="player-gpu-layer h-full bg-[var(--accent)] absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
});
