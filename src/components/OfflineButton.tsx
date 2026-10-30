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

  const content = (() => {
    if (downloaded) return <><Check size={compact ? 16 : 17} strokeWidth={3} /><span>{compact ? '' : 'Saved offline'}</span></>;
    if (state.status === 'downloading') {
      const percent = state.progress >= 0 ? Math.round(state.progress * 100) : null;
      return <><span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /><span>{compact ? (percent === null ? '' : `${percent}%`) : `Saving${percent === null ? '…' : ` ${percent}%`}`}</span></>;
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
          startVideoDownload(item, playback);
        }
      }}
      disabled={!eligible || !isOnline || downloaded || state.status === 'downloading'}
      title={state.error || (!eligible ? 'Offline downloads are disabled for this stream.' : 'Save this licensed video offline')}
      className={compact
        ? `w-9 h-9 rounded-full flex items-center justify-center ${downloaded ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} disabled:opacity-55`
        : `secondary-button ${downloaded ? '!text-[var(--accent)]' : ''}`}
    >
      {content}
    </button>
  );
}
