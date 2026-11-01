'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Film,
  ListPlus,
  Loader2,
  Play,
  Plus,
  Share2,
  Star,
  Tv,
} from 'lucide-react';
import { useStream } from '@/context/StreamContext';
import { MediaCard } from '@/components/MediaCard';
import { OfflineButton } from '@/components/OfflineButton';
import type { MediaDetails, MediaEpisode, MediaItem } from '@/types';

const detailsCache = new Map<string, { value: MediaDetails; expires: number }>();

export function DetailsSheet({
  item,
  onClose,
  onSelect,
}: {
  item: MediaItem;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}) {
  const {
    playItem,
    toggleWatchlist,
    isWatchlisted,
    collections,
    createCollection,
    addToCollection,
  } = useStream();
  const cachedDetails = detailsCache.get(item.id);
  const initialDetails = cachedDetails && cachedDetails.expires > Date.now() ? cachedDetails.value : null;

  const [details, setDetails] = useState<MediaDetails | null>(initialDetails);
  const [loading, setLoading] = useState(!initialDetails);
  const [error, setError] = useState<string | null>(null);
  const [showLists, setShowLists] = useState(false);
  const [newList, setNewList] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(initialDetails?.selectedSeason || initialDetails?.seasons?.[0]?.number || 1);
  const [episodes, setEpisodes] = useState<MediaEpisode[]>(initialDetails?.episodes || []);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const cached = detailsCache.get(item.id);
    if (cached && cached.expires > Date.now()) {
      setDetails(cached.value);
      setSelectedSeason(cached.value.selectedSeason || cached.value.seasons?.[0]?.number || 1);
      setEpisodes(cached.value.episodes || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setDetails(null);
    setEpisodes([]);
    setEpisodeError(null);
    const url = item.id.startsWith('netmirror-')
      ? `/api/netmirror/title?id=${encodeURIComponent(item.providerId)}&title=${encodeURIComponent(item.title)}&type=${item.mediaType}&year=${encodeURIComponent(item.year)}`
      : `/api/title?type=${item.mediaType}&id=${encodeURIComponent(item.providerId)}`;
    fetch(url)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load title details.');
        return payload as MediaDetails;
      })
      .then((payload) => {
        if (!active) return;
        detailsCache.set(item.id, { value: payload, expires: Date.now() + 5 * 60 * 1000 });
        setDetails(payload);
        setSelectedSeason(payload.selectedSeason || payload.seasons?.[0]?.number || 1);
        setEpisodes(payload.episodes || []);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load details.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item]);

  const media = details || item;
  const saved = isWatchlisted(media.id);
  const canPlay = media.mediaType === 'tv' ? (episodes.length > 0 || !loading) : Boolean(media.playback?.url || details);
  const durationMinutes = media.durationSeconds ? Math.round(media.durationSeconds / 60) : 0;

  const loadSeason = async (season: number) => {
    setSelectedSeason(season);
    setEpisodesLoading(true);
    setEpisodeError(null);
    try {
      if (!details?.catalogId) throw new Error('Season information is unavailable.');
      const response = await fetch(`/api/netmirror/season?catalogId=${details.catalogId}&season=${season}`);
      const payload = await response.json() as { episodes?: MediaEpisode[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not load this season.');
      setEpisodes(payload.episodes || []);
    } catch (caught) {
      setEpisodes([]);
      setEpisodeError(caught instanceof Error ? caught.message : 'Could not load this season.');
    } finally {
      setEpisodesLoading(false);
    }
  };

  const playEpisode = async (entry: MediaEpisode) => {
    setPlayingEpisode(entry.number);
    setEpisodeError(null);
    try {
      const url = `/api/netmirror/title?id=${encodeURIComponent(item.providerId)}&title=${encodeURIComponent(item.title)}&type=tv&year=${encodeURIComponent(item.year)}&season=${selectedSeason}&episode=${entry.number}`;
      const response = await fetch(url);
      const payload = await response.json() as MediaDetails & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not play this episode.');
      playItem(payload, [payload]);
      onClose();
    } catch (caught) {
      setEpisodeError(caught instanceof Error ? caught.message : 'Could not play this episode.');
    } finally {
      setPlayingEpisode(null);
    }
  };

  const play = () => {
    if (media.mediaType === 'tv') {
      if (episodes.length > 0) {
        void playEpisode(episodes[0]);
        return;
      }
      playItem(media, [media]);
      onClose();
      return;
    }
    const queue = details ? [details, ...(details.related || []).filter((entry) => entry.playback)] : [media];
    playItem(media, queue);
    onClose();
  };

  const share = () => {
    const url = `${window.location.origin}/?title=${encodeURIComponent(media.title)}`;
    if (navigator.share) {
      navigator.share({ title: media.title, text: `Watch ${media.title} on Co Stream`, url }).catch(() => undefined);
    } else {
      navigator.clipboard.writeText(url).catch(() => undefined);
    }
  };

  const createAndAdd = () => {
    const collection = createCollection(newList);
    if (collection) {
      addToCollection(collection.id, media);
      setNewList('');
      setShowLists(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-md" onClick={onClose}>
      <div className="absolute bottom-0 left-0 right-0 h-[94%] sm:h-[92%] overflow-y-auto no-scrollbar rounded-t-[30px] bg-[var(--bg)] border-t border-[var(--line)]" onClick={(event) => event.stopPropagation()}>
        <div className="relative min-h-[360px] sm:min-h-[430px] overflow-hidden rounded-t-[30px]">
          {media.backdropUrl || media.posterUrl ? (
            <Image src={(media.backdropUrl || media.posterUrl)!} alt="" fill priority sizes="100vw" className="object-cover" />
          ) : <div className="absolute inset-0 bg-gradient-to-br from-[#1a2b31] to-[#11111c]" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-[var(--bg)]" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
            <span className="glass-label">{media.mediaType === 'tv' ? <Tv size={13} /> : <Film size={13} />}{media.mediaType === 'tv' ? 'Series' : 'Movie'}</span>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-xl text-white flex items-center justify-center border border-white/15"><ChevronDown size={20} /></button>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 max-w-6xl mx-auto">
            <div className="flex items-end gap-4 sm:gap-6">
              <div className="relative hidden sm:block w-36 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0">
                {media.posterUrl ? <Image src={media.posterUrl} alt={media.title} fill sizes="144px" className="object-cover" /> : <div className="w-full h-full bg-[var(--panel)]" />}
              </div>
              <div className="min-w-0 pb-1">
                {media.tagline && <p className="eyebrow !text-[var(--accent)] mb-2">{media.tagline}</p>}
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.045em] text-[var(--text)] drop-shadow-lg leading-[.98]">{media.title}</h2>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 text-xs font-bold text-[var(--text-muted)]">
                  <span>{media.year}</span>
                  {media.rating > 0 && <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-300"><Star size={13} className="fill-current" />{media.rating.toFixed(1)}</span>}
                  {durationMinutes > 0 && <span className="inline-flex items-center gap-1"><Clock3 size={13} />{durationMinutes} min</span>}
                  {media.seasonCount ? <span>{media.seasonCount} season{media.seasonCount === 1 ? '' : 's'}</span> : null}
                  {media.playback?.label && <span className="text-[var(--accent)]">{media.playback.label}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-28">
          {loading && <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-3"><Loader2 size={16} className="animate-spin text-[var(--accent)]" /> Loading playback and cast…</div>}
          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 flex items-start gap-3">
              <span className="text-lg mt-0.5">🚫</span>
              <div className="min-w-0">
                <p className="text-xs font-black text-red-400">Stream unavailable</p>
                <p className="text-[11px] text-red-400/75 mt-0.5 leading-5">{error}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 mt-2">
            <button onClick={play} disabled={loading || !canPlay || playingEpisode !== null} className="primary-button min-w-36 disabled:opacity-45 disabled:cursor-not-allowed"><Play size={17} className="fill-current" />{media.playback?.kind === 'youtube' ? 'Watch trailer' : media.mediaType === 'tv' ? `Play S${selectedSeason} E${episodes[0]?.number || 1}` : 'Play film'}</button>
            <button onClick={() => toggleWatchlist(media)} className={`secondary-button ${saved ? '!text-[var(--accent)]' : ''}`}><Bookmark size={17} className={saved ? 'fill-current' : ''} />{saved ? 'In watchlist' : 'Watchlist'}</button>
            <button onClick={() => setShowLists(true)} className="secondary-button"><ListPlus size={17} />Add to list</button>
            <OfflineButton item={media} source={media.playback} />
            <button onClick={share} className="secondary-button"><Share2 size={17} />Share</button>
          </div>

          {!canPlay && !loading && (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">No playable source is currently available for this title.</p>
          )}

          <div className="grid md:grid-cols-[1fr_280px] gap-8 mt-7">
            <div>
              <h3 className="text-sm font-black">Story</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-muted)] max-w-3xl">{media.overview}</p>
              {media.cast?.length ? (
                <div className="mt-5"><h3 className="text-sm font-black">Cast</h3><p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">{media.cast.join(' • ')}</p></div>
              ) : null}
            </div>
            <div className="rounded-3xl bg-[var(--panel)] border border-[var(--line)] p-4 h-fit">
              <p className="eyebrow">Details</p>
              <dl className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-[var(--text-faint)]">Type</dt><dd className="font-bold capitalize">{media.mediaType === 'tv' ? 'Series' : 'Movie'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--text-faint)]">Language</dt><dd className="font-bold uppercase">{media.language}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--text-faint)]">Genres</dt><dd className="font-bold text-right">{(media.genres || []).join(', ') || '—'}</dd></div>
                {media.episodeCount ? <div className="flex justify-between gap-3"><dt className="text-[var(--text-faint)]">Episodes</dt><dd className="font-bold">{media.episodeCount}</dd></div> : null}
              </dl>
            </div>
          </div>

          {media.mediaType === 'tv' && details?.seasons?.length ? (
            <section className="mt-9">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div><p className="eyebrow">Episodes</p><h3 className="text-xl font-black">Season {selectedSeason}</h3></div>
                <select
                  value={selectedSeason}
                  onChange={(event) => void loadSeason(Number(event.target.value))}
                  className="field !w-auto min-w-40 font-bold"
                  aria-label="Select season"
                >
                  {details.seasons.map((season) => (
                    <option key={season.number} value={season.number}>{season.name} · {season.episodeCount}</option>
                  ))}
                </select>
              </div>

              {episodeError && <p className="mt-3 text-xs text-red-500">{episodeError}</p>}
              {episodesLoading ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 size={16} className="animate-spin text-[var(--accent)]" />Loading episodes…</div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {episodes.map((entry) => (
                    <button
                      key={`${selectedSeason}-${entry.number}`}
                      onClick={() => void playEpisode(entry)}
                      disabled={playingEpisode !== null}
                      className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] text-left hover:border-[var(--accent)]/50 transition disabled:opacity-55"
                    >
                      <div className="flex min-h-28">
                        <div className="relative w-36 sm:w-40 shrink-0 bg-black/20">
                          {entry.stillUrl ? <Image src={entry.stillUrl} alt="" fill sizes="160px" className="object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[var(--text-faint)]"><Tv size={24} /></div>}
                          <span className="absolute left-2 top-2 min-w-7 h-7 px-2 rounded-full bg-black/75 text-white text-[11px] font-black flex items-center justify-center">{entry.number}</span>
                        </div>
                        <div className="min-w-0 flex-1 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-black line-clamp-2">{entry.name}</h4>
                            {playingEpisode === entry.number ? <Loader2 size={15} className="animate-spin text-[var(--accent)] shrink-0" /> : <Play size={15} className="text-[var(--accent)] fill-current shrink-0 opacity-70 group-hover:opacity-100" />}
                          </div>
                          <p className="mt-1 text-[10px] text-[var(--text-faint)]">S{selectedSeason} E{entry.number}{entry.runtimeMinutes ? ` · ${entry.runtimeMinutes} min` : ''}{entry.airDate ? ` · ${entry.airDate}` : ''}</p>
                          {entry.overview && <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)] line-clamp-3">{entry.overview}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!episodes.length && !episodeError && <p className="text-xs text-[var(--text-muted)]">No episodes found for this season.</p>}
                </div>
              )}
            </section>
          ) : null}

          {(details?.related || []).length > 0 ? (
            <section className="mt-9">
              <div className="mb-4"><p className="eyebrow">Up next</p><h3 className="text-xl font-black">More like this</h3></div>
              <div className="media-grid-scroll mt-4">
                {(details?.related || []).filter((r) => !/^(cid|c\.i\.d)/i.test(r.title.trim()) && r.providerId !== 'tmdb:tv:15226').slice(0, 12).map((related) => <MediaCard key={related.id} item={related} onOpen={(next) => onSelect(next)} />)}
              </div>
            </section>
          ) : null}
        </div>

        {showLists && (
          <div className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setShowLists(false)}>
            <div className="w-full max-w-sm rounded-[26px] bg-[var(--panel-elevated)] border border-[var(--line)] p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between"><h3 className="font-black">Add to a list</h3><button onClick={() => setShowLists(false)} className="icon-button"><ChevronDown size={18} /></button></div>
              <div className="mt-3 max-h-52 overflow-y-auto space-y-1">
                {collections.map((collection) => {
                  const added = collection.items.some((entry) => entry.id === media.id);
                  return (
                    <button key={collection.id} onClick={() => addToCollection(collection.id, media)} className="w-full flex items-center gap-3 rounded-2xl p-3 hover:bg-[var(--panel)] text-left">
                      <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">{added ? <Check size={16} /> : <Plus size={16} />}</span>
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black truncate">{collection.title}</span><span className="block text-[10px] text-[var(--text-faint)]">{collection.items.length} titles</span></span>
                    </button>
                  );
                })}
                {!collections.length && <p className="text-xs text-[var(--text-muted)] text-center py-4">Create your first list below.</p>}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={newList} onChange={(event) => setNewList(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createAndAdd()} placeholder="New list name" className="field flex-1" />
                <button onClick={createAndAdd} className="primary-button !px-4">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
