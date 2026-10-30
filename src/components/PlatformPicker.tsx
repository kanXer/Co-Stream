'use client';

import React, { useEffect, useState } from 'react';
import { Check, Play, SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_STREAMING_PLATFORMS,
  STREAMING_PLATFORMS,
  type StreamingPlatformId,
} from '@/lib/platforms';

export function PlatformPicker({
  open,
  selected,
  required = false,
  onClose,
  onSave,
}: {
  open: boolean;
  selected: StreamingPlatformId[];
  required?: boolean;
  onClose: () => void;
  onSave: (platforms: StreamingPlatformId[]) => void;
}) {
  const [draft, setDraft] = useState<StreamingPlatformId[]>(selected.length ? selected : DEFAULT_STREAMING_PLATFORMS);

  useEffect(() => {
    if (open) setDraft(selected.length ? selected : DEFAULT_STREAMING_PLATFORMS);
  }, [open, selected]);

  if (!open) return null;

  const toggle = (id: StreamingPlatformId) => {
    setDraft((items) => items.includes(id) ? items.filter((entry) => entry !== id) : [...items, id]);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#020406]/90 backdrop-blur-2xl flex items-center justify-center p-4" onClick={() => !required && onClose()}>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1013] text-white shadow-[0_35px_120px_rgba(0,0,0,.65)]" onClick={(event) => event.stopPropagation()}>
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(127,255,210,.16),transparent_70%)] pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          {!required && <button onClick={onClose} className="absolute right-5 top-5 player-icon"><X size={17} /></button>}
          <div className="w-12 h-12 rounded-2xl bg-[#7fffd2] text-[#03100d] flex items-center justify-center shadow-[0_12px_35px_rgba(127,255,210,.25)]"><SlidersHorizontal size={22} /></div>
          <p className="mt-5 text-[10px] uppercase tracking-[.2em] font-black text-[#7fffd2]">Personalize your home</p>
          <h2 className="mt-1 text-3xl sm:text-4xl font-black tracking-[-.045em]">What do you watch?</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">Choose one or more platforms. Your home, movies, and web-series rows will follow these choices.</p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STREAMING_PLATFORMS.map((platform) => {
              const active = draft.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  onClick={() => toggle(platform.id)}
                  className={`relative min-h-24 rounded-2xl border p-4 text-left transition active:scale-[.98] ${active ? 'border-[#7fffd2]/70 bg-[#7fffd2]/10' : 'border-white/10 bg-white/[.035] hover:bg-white/[.07]'}`}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white" style={{ backgroundColor: platform.color }}>{platform.shortLabel}</span>
                  <span className="block mt-3 text-xs font-black">{platform.label}</span>
                  <span className={`absolute right-3 top-3 w-5 h-5 rounded-full border flex items-center justify-center ${active ? 'border-[#7fffd2] bg-[#7fffd2] text-[#03100d]' : 'border-white/20 text-transparent'}`}><Check size={12} strokeWidth={4} /></span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button onClick={() => setDraft(STREAMING_PLATFORMS.map((platform) => platform.id))} className="text-xs font-bold text-white/55 hover:text-white">Select all</button>
            <button onClick={() => onSave(draft)} disabled={!draft.length} className="primary-button min-w-40 justify-center disabled:opacity-40"><Play size={16} className="fill-current" />Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}
