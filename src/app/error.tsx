'use client';

import React, { useEffect } from 'react';
import { RotateCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Co-Stream Runtime Error Boundary Caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#070b0e] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-2xl shadow-2xl">
        ⚠️
      </div>
      <h2 className="text-lg font-black tracking-wide mb-2 text-white">Playback or Navigation Encountered an Issue</h2>
      <p className="text-xs text-white/60 max-w-md mb-6 leading-relaxed">
        {error?.message || 'A temporary render or network error occurred. Click below to reload safely.'}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#7fffd2] text-black font-black text-xs transition active:scale-95 shadow-[0_4px_20px_rgba(127,255,210,0.3)] cursor-pointer"
        >
          <RotateCw size={14} className="stroke-[2.5]" />
          Retry
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/';
          }}
          className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/10 transition active:scale-95 cursor-pointer"
        >
          Return Home
        </button>
      </div>
    </div>
  );
}
