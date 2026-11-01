'use client';

import React, { useEffect, useState } from 'react';

interface BufferingOverlayProps {
  isBuffering: boolean;
}

/** Grace window (ms) before the overlay appears so momentary stalls between
 *  buffered segments don't flash the spinner on and off. */
const SHOW_DELAY_MS = 400;

export const BufferingOverlay = React.memo(function BufferingOverlay({
  isBuffering,
}: BufferingOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isBuffering) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isBuffering]);

  if (!visible) return null;

  return (
    <div className="player-gpu-layer pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-opacity duration-300">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#7fffd2]/25 animate-ping opacity-60" />
          <div className="absolute inset-0 rounded-full border-2 border-[#7fffd2]/20" />
          <div className="w-12 h-12 rounded-full border-3 border-transparent border-t-[#7fffd2] border-r-[#7fffd2] animate-spin" />
        </div>
        <span className="text-[11px] font-black tracking-[0.2em] text-[#7fffd2] uppercase drop-shadow-[0_2px_10px_rgba(127,255,210,0.5)]">
          Buffering…
        </span>
      </div>
    </div>
  );
});
