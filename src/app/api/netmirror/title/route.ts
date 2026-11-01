import {
  getCurrentNetMirrorSeason,
  getCurrentNetMirrorTitle,
  getCurrentNetMirrorVariants,
  orderedNetMirrorAudioVariants,
  proxiedMediaPath,
  resolveCurrentNetMirrorStream,
} from '@/lib/netmirror';
import type { MediaDetails, PlaybackSource } from '@/types';

// Upstream embed/variant APIs are fetched with 30s timeouts and possible
// fallback playlist resolution — allow the full chain to finish.
export const maxDuration = 60;

const PLAYBACK_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

function audioLabel(value?: string) {
  if (!value || value === 'Default') return 'Original';
  return value.replace(/\s+dub$/i, '').replace(/\s+sub$/i, ' subtitles');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  const title = (searchParams.get('title') || '').trim() || `NetMirror ${id}`;
  const mediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const year = (searchParams.get('year') || '').trim().slice(0, 4);
  const season = Math.max(1, Math.min(100, Number(searchParams.get('season')) || 1));
  const episode = Math.max(1, Math.min(1000, Number(searchParams.get('episode')) || 1));
  const episodeSelected = searchParams.has('episode');
  const audioId = (searchParams.get('audioId') || '').trim();
  const audioPath = (searchParams.get('audioPath') || '').trim();
  const playbackOnly = searchParams.get('playbackOnly') === '1';

  if (!id || id.length > 80) {
    return Response.json({ error: 'A valid NetMirror title id is required.' }, { status: 400 });
  }

  let resolved: Awaited<ReturnType<typeof resolveCurrentNetMirrorStream>> | null = null;
  try {
    resolved = await resolveCurrentNetMirrorStream({
      providerId: id,
      title,
      type: mediaType,
      year,
      season,
      episode,
      audioSubjectId: /^\d+$/.test(audioId) ? audioId : undefined,
      audioDetailPath: audioPath || undefined,
    });
  } catch (streamError) {
    console.warn(`NetMirror stream resolution failed for "${title}":`, streamError);
  }

  if (!resolved) {
    return Response.json({ error: `"${title}" is not yet available to stream on NetMirror.` }, { status: 404 });
  }

  try {
    const variants = await getCurrentNetMirrorVariants(resolved.tmdbId, resolved.type, season, episode).catch(() => null);
    const downloadStream = resolved.streams.find((stream) => stream.resolution === '360p')
      || resolved.streams.find((stream) => stream.resolution === '480p')
      || resolved.streams.find((stream) => stream.resolution === '720p')
      || resolved.streams.at(-1);
    const isAdaptiveHls = resolved.streamUrl.includes('.m3u8') || resolved.streamUrl.startsWith('synthetic:');
    const playback: PlaybackSource = {
      kind: 'direct',
      label: resolved.resolution,
      url: proxiedMediaPath(resolved.streamUrl),
      downloadUrl: downloadStream ? proxiedMediaPath(downloadStream.url) : proxiedMediaPath(resolved.streamUrl),
      mimeType: isAdaptiveHls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
      downloadable: true,
      resolvedAt: Date.now(),
      // HLS masters contain multiple variants. Keep them on Auto so hls.js can
      // downshift during a weak connection instead of pinning every viewer to
      // 720p and rebuffering. Explicit user quality choices still pin a level.
      selectedQuality: isAdaptiveHls ? 'Auto' : resolved.resolution,
      selectedAudio: audioLabel(resolved.audioLanguage),
      qualities: resolved.streams.map((stream) => ({
        label: stream.resolution,
        url: proxiedMediaPath(stream.url),
      })),
      subtitles: resolved.captions.map((caption) => ({
        id: caption.id,
        label: caption.label,
        language: caption.language,
        url: `/api/netmirror/subtitle?target=${encodeURIComponent(caption.url)}`,
      })),
      audioTracks: orderedNetMirrorAudioVariants(variants?.variants || [])
        .map((entry) => {
          const params = new URLSearchParams({
            id,
            title,
            type: resolved.type,
            year,
            season: String(season),
            episode: String(episode),
            audioId: entry.dubSubjectId,
            audioPath: entry.detailPath,
            playbackOnly: '1',
          });
          return {
            id: entry.dubSubjectId,
            label: audioLabel(entry.language),
            resolveUrl: `/api/netmirror/title?${params.toString()}`,
          };
        }),
    };

    if (playbackOnly) {
      const quickDetails: MediaDetails = {
        id: `netmirror-${id}${episodeSelected && resolved.type === 'tv' ? `-s${season}e${episode}` : ''}`,
        providerId: id,
        mediaType: resolved.type,
        title: episodeSelected && resolved.type === 'tv'
          ? `${resolved.title} • S${season} E${episode}`
          : resolved.title,
        overview: resolved.overview,
        year: resolved.year,
        rating: resolved.rating,
        posterUrl: resolved.posterUrl
          ? proxiedMediaPath(resolved.posterUrl)
          : `/api/poster?title=${encodeURIComponent(title)}`,
        backdropUrl: null,
        genres: [],
        durationSeconds: 0,
        language: 'en',
        catalogId: resolved.tmdbId,
        selectedSeason: resolved.type === 'tv' ? season : undefined,
        selectedEpisode: resolved.type === 'tv' ? episode : undefined,
        playback,
        related: [],
      };
      return Response.json(quickDetails, { headers: PLAYBACK_CACHE_HEADERS });
    }

    const metadata = await getCurrentNetMirrorTitle(resolved.tmdbId, resolved.type).catch(() => null);
    const seasonPayload = resolved.type === 'tv' && metadata?.initialSeason !== season
      ? await getCurrentNetMirrorSeason(resolved.tmdbId, season).catch(() => null)
      : null;
    const rawEpisodes = seasonPayload?.episodes || metadata?.initialEpisodes || [];
    const currentEpisode = rawEpisodes.find((entry) => Number(entry.episode) === episode);

    const displayTitle = episodeSelected && resolved.type === 'tv'
      ? `${resolved.title} • S${season} E${episode}${currentEpisode?.name ? ` — ${currentEpisode.name}` : ''}`
      : resolved.title;

    const details: MediaDetails = {
      id: `netmirror-${id}${episodeSelected && resolved.type === 'tv' ? `-s${season}e${episode}` : ''}`,
      providerId: id,
      mediaType: resolved.type,
      title: displayTitle,
      tagline: metadata?.tagline || undefined,
      overview: episodeSelected
        ? currentEpisode?.overview || metadata?.overview || resolved.overview
        : metadata?.overview || resolved.overview,
      year: metadata?.year || resolved.year,
      rating: episodeSelected
        ? Number(currentEpisode?.rating) || Number(metadata?.rating) || resolved.rating
        : Number(metadata?.rating) || resolved.rating,
      posterUrl: metadata?.poster
        ? proxiedMediaPath(metadata.poster)
        : resolved.posterUrl
          ? proxiedMediaPath(resolved.posterUrl)
          : `/api/poster?title=${encodeURIComponent(title)}`,
      backdropUrl: metadata?.backdrop ? proxiedMediaPath(metadata.backdrop) : null,
      genres: (metadata?.genres || []).map((genre) => genre.name || '').filter(Boolean),
      durationSeconds: episodeSelected ? (Number(currentEpisode?.runtime) || 0) * 60 : 0,
      language: metadata?.originalLanguage || 'en',
      catalogId: resolved.tmdbId,
      selectedSeason: resolved.type === 'tv' ? season : undefined,
      selectedEpisode: resolved.type === 'tv' ? episode : undefined,
      seasonCount: resolved.type === 'tv' ? metadata?.seasons?.length || 0 : undefined,
      episodeCount: resolved.type === 'tv'
        ? metadata?.seasons?.reduce((total, entry) => total + (Number(entry.episode_count) || 0), 0) || rawEpisodes.length
        : undefined,
      seasons: resolved.type === 'tv'
        ? (metadata?.seasons || []).map((entry) => ({
            number: Number(entry.season_number) || 0,
            name: entry.name || `Season ${entry.season_number}`,
            episodeCount: Number(entry.episode_count) || 0,
          })).filter((entry) => entry.number > 0)
        : undefined,
      episodes: resolved.type === 'tv'
        ? rawEpisodes.map((entry) => ({
            number: Number(entry.episode) || 0,
            name: entry.name || `Episode ${entry.episode}`,
            overview: entry.overview || '',
            stillUrl: entry.still ? proxiedMediaPath(entry.still) : null,
            runtimeMinutes: Number(entry.runtime) || 0,
            airDate: entry.airDate || '',
            rating: Number(entry.rating) || 0,
          })).filter((entry) => entry.number > 0)
        : undefined,
      playback,
      related: [],
    };

    return Response.json(details, { headers: PLAYBACK_CACHE_HEADERS });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not resolve NetMirror title.' }, { status: 502 });
  }
}
