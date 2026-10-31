'use client';

import React from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaEpisode, MediaItem } from '@/types';

export interface PlayerEpisodesSectionProps {
  episodesRef: React.RefObject<HTMLElement | null>;
  episodeSeason: number;
  episodesPending: boolean;
  episodesLoading: boolean;
  episodeError: string | null;
  playerEpisodes: MediaEpisode[];
  currentItem: MediaItem;
  switchingEpisode: number | null;
  onSelectSeason: (season: number) => void;
  onPlayEpisode: (episode: MediaEpisode) => void;
}

export const PlayerEpisodesSection = React.memo(function PlayerEpisodesSection({
  episodesRef,
  episodeSeason,
  episodesPending,
  episodesLoading,
  episodeError,
  playerEpisodes,
  currentItem,
  switchingEpisode,
  onSelectSeason,
  onPlayEpisode,
}: PlayerEpisodesSectionProps) {
  return (
    <section ref={episodesRef} className="watch-glass mt-4 scroll-mt-24 rounded-[26px] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="watch-accent text-[9px] uppercase tracking-[.18em] font-black">Seasons & episodes</p>
          <h3 className="mt-1 text-lg font-black">Season {episodeSeason}</h3>
        </div>
        {episodesPending ? (
          <span className="h-7 w-24 animate-pulse rounded-full bg-[var(--line)]/70" />
        ) : (
          <span className="watch-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] font-bold">
            {playerEpisodes.length || currentItem.episodeCount || 0} episodes
          </span>
        )}
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {episodesPending
          ? [0, 1, 2].map((index) => (
              <span key={index} className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-[var(--line)]/70" />
            ))
          : (currentItem.seasons?.length
              ? currentItem.seasons
              : [{ number: episodeSeason, name: `Season ${episodeSeason}`, episodeCount: playerEpisodes.length }]
            ).map((season) => (
              <button
                type="button"
                key={season.number}
                onClick={() => onSelectSeason(season.number)}
                disabled={episodesLoading}
                className={`watch-season-chip shrink-0 rounded-full px-4 py-2 text-[11px] font-black ${
                  season.number === episodeSeason ? 'active' : ''
                }`}
              >
                S{season.number}
                <span className="ml-1.5 font-semibold opacity-60">{season.episodeCount || ''}</span>
              </button>
            ))}
      </div>

      {episodesPending ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex animate-pulse items-center gap-3 rounded-2xl border border-[var(--line)] p-2">
              <span className="h-16 w-24 shrink-0 rounded-xl bg-[var(--line)]/75" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-3 w-3/4 rounded-full bg-[var(--line)]/75" />
                <span className="block h-2 w-1/2 rounded-full bg-[var(--line)]/55" />
              </span>
              <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--line)]/70" />
            </div>
          ))}
        </div>
      ) : playerEpisodes.length ? (
        <div className="no-scrollbar mt-3 grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
          {playerEpisodes.map((episode) => {
            const active = currentItem.selectedSeason === episodeSeason && currentItem.selectedEpisode === episode.number;
            return (
              <button
                type="button"
                key={`${episodeSeason}-${episode.number}`}
                onClick={() => onPlayEpisode(episode)}
                disabled={switchingEpisode !== null}
                className={`watch-episode-card group flex min-w-0 items-center gap-3 rounded-2xl p-2 text-left disabled:opacity-60 ${
                  active ? 'active' : ''
                }`}
              >
                <span className="watch-episode-art relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black">
                  {episode.stillUrl ? (
                    <Image
                      src={episode.stillUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    `E${episode.number}`
                  )}
                  <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white">
                    S{episodeSeason} E{episode.number}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">{episode.name || `Episode ${episode.number}`}</span>
                  <span className="watch-muted mt-1 block truncate text-[9px]">
                    {episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : 'Episode'}
                    {episode.airDate ? ` • ${episode.airDate}` : ''}
                  </span>
                </span>
                <span className="watch-episode-play flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  {switchingEpisode === episode.number ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Play size={14} className="fill-current ml-0.5" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="watch-muted py-10 text-center text-xs">No episodes are available for this season.</p>
      )}
      {episodeError && (
        <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-500">
          {episodeError}
        </p>
      )}
    </section>
  );
});
