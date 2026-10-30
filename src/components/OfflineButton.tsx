'use client';

import React from 'react';
import { AlertTriangle, Check, Download, LockKeyhole, WifiOff } from 'lucide-react';
import { useDownloadedIds, useDownloadState, useOfflineStatus } from '@/lib/offlineHooks';
import { startVideoDownload } from '@/lib/offlineStore';
import type { MediaItem, PlaybackSource } from '@/types';

export function OfflineButton({
  item,
  source,
  compact = false,
}: {
  item: MediaItem;
  source?: PlaybackSource | null;
  compact?: boolean;
}) {
  const playback = source || item.playback;
  const state = useDownloadState(item.id);
  const downloaded = useDownloadedIds().has(item.id) || state.status === 'downloaded';
  const { isOnline } = useOfflineStatus();
  const eligible = playback?.kind === 'direct' && Boolean(playback.url && playback.downloadable);
  const percent = state.progress >= 0 ? Math.min(100, Math.round(state.progress * 100)) : null;

  const content = (() => {
    if (downloaded) return <><Check size={compact ? 16 : 17} strokeWidth={3} /><span>{compact ? '' : 'Saved offline'}</span></>;
    if (state.status === 'downloading') {
      return compact
        ? <span className="text-[8px] font-black tabular-nums text-[var(--accent)]">{percent === null ? '…' : `${percent}%`}</span>
        : <><span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /><span>{`Saving${percent === null ? '…' : ` ${percent}%`}`}</span></>;
    }
    if (state.status === 'error') return <><AlertTriangle size={compact ? 16 : 17} /><span>{compact ? '' : 'Retry save'}</span></>;
    if (!eligible) return <><LockKeyhole size={compact ? 15 : 16} /><span>{compact ? '' : 'Streaming only'}</span></>;
    if (!isOnline) return <><WifiOff size={compact ? 16 : 17} /><span>{compact ? '' : 'Offline'}</span></>;
    return <><Download size={compact ? 16 : 17} /><span>{compact ? '' : 'Save offline'}</span></>;
  })();

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        if (eligible && isOnline && !downloaded && state.status !== 'downloading') {
          void startVideoDownload(item, playback);
        }
      }}
      disabled={!eligible || !isOnline || downloaded || state.status === 'downloading'}
      title={state.error || (state.status === 'downloading' ? `Downloading${percent === null ? '' : ` ${percent}%`}` : !eligible ? 'Offline downloads are disabled for this stream.' : 'Save this video offline')}
      style={compact && state.status === 'downloading' && percent !== null ? {
        background: `conic-gradient(var(--accent) ${percent * 3.6}deg, var(--line) 0deg)`,
        boxShadow: 'inset 0 0 0 4px var(--panel-elevated)',
      } : undefined}
      className={compact
        ? `relative w-9 h-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel-elevated)] flex items-center justify-center ${downloaded ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} disabled:opacity-80`
        : `secondary-button relative overflow-hidden ${downloaded ? '!text-[var(--accent)]' : ''}`}
    >
      {content}
      {!compact && state.status === 'downloading' && <span className="absolute inset-x-0 bottom-0 h-1 bg-[var(--line)]"><span className="block h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${percent || 0}%` }} /></span>}
    </button>
  );
}
