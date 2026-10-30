import 'server-only';

import {
  discoverCurrentNetMirror,
  getCurrentNetMirrorCurated,
  getCurrentNetMirrorHome,
  getCurrentNetMirrorVariants,
  proxiedMediaPath,
  resolveCurrentNetMirrorStream,
  searchCurrentNetMirror,
  type NetMirrorCatalogItem,
} from '@/lib/netmirror';
import { isStreamingPlatformId, platformLabel, type StreamingPlatformId } from '@/lib/platforms';
import type { CatalogPayload, HomeSection, MediaDetails, MediaItem, MediaType } from '@/types';

export const isTmdbConfigured = false;

function proxiedImage(url?: string | null) {
  return url ? proxiedMediaPath(url) : null;
}

function mapCurrentItem(item: NetMirrorCatalogItem, providerId?: string): MediaItem {
  const resolvedProviderId = providerId || `tmdb:${item.type}:${item.tmdbId}`;
  return {
    id: `netmirror-${resolvedProviderId}`,
    providerId: resolvedProviderId,
    mediaType: item.type,
    title: item.title,
    overview: item.overview || 'Now available to watch.',
    year: item.year || '—',
    rating: Number(item.rating) || 0,
    posterUrl: proxiedImage(item.poster),
    backdropUrl: proxiedImage(item.backdrop),
    genres: [],
    durationSeconds: 0,
    language: 'en',
    playback: null,
  };
}

function uniqueCatalogItems(items: NetMirrorCatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.tmdbId}`;
    if (!item.tmdbId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fillHindiAudioTitles(
  initial: NetMirrorCatalogItem[],
  candidates: NetMirrorCatalogItem[],
  type: 'movie' | 'tv',
  limit = 10,
) {
  const picked = uniqueCatalogItems(initial).slice(0, limit);
  const seen = new Set(picked.map((item) => `${item.type}:${item.tmdbId}`));
  const remaining = candidates.filter((item) => !seen.has(`${item.type}:${item.tmdbId}`));

  for (let index = 0; index < remaining.length && picked.length < limit; index += 5) {
    const batch = remaining.slice(index, index + 5);
    const checks = await Promise.allSettled(batch.map(async (item) => ({
      item,
      variants: await getCurrentNetMirrorVariants(item.tmdbId, type),
    })));
    for (const check of checks) {
      if (check.status !== 'fulfilled') continue;
      if (check.value.variants.variants?.some((variant) => /hindi/i.test(variant.language || ''))) {
        picked.push(check.value.item);
        if (picked.length >= limit) break;
      }
    }
  }
  return picked;
}

async function getPlatformHindiRows(platform: StreamingPlatformId, region: string) {
  const [curatedResult, movieResult, seriesResult] = await Promise.allSettled([
    getCurrentNetMirrorCurated(platform),
    discoverCurrentNetMirror({ type: 'movie', region, platform, sort: 'popularity' }),
    discoverCurrentNetMirror({ type: 'tv', region, platform, country: 'IN', sort: 'popularity' }),
  ]);
  const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
  const platformMovies = movieResult.status === 'fulfilled' ? movieResult.value : [];
  const platformSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];
  const hindiMovieRails = curated.filter((rail) => /hindi|bollywood|indian/i.test(rail.title));
  const curatedMovies = uniqueCatalogItems(hindiMovieRails.flatMap((rail) => rail.items).filter((item) => item.type === 'movie'));
  const movies = await fillHindiAudioTitles(curatedMovies, platformMovies, 'movie');
  const series = platformSeries.slice(0, 10);
  return { movies, series };
}

export async function getHomeCatalog(
  region = 'IN',
  _language = 'hi',
  requestedPlatforms: string[] = ['Netflix', 'PrimeVideo'],
  view: 'home' | 'movie' | 'tv' = 'home',
): Promise<CatalogPayload> {
  try {
    const platforms = requestedPlatforms.filter(isStreamingPlatformId) as StreamingPlatformId[];
    if (view === 'home') {
      const platformRows = await Promise.all(platforms.map(async (platform) => ({
        platform,
        ...(await getPlatformHindiRows(platform, region)),
      })));
      const sections = platformRows.flatMap(({ platform, movies, series }) => ([
        {
          id: `top10-hindi-${platform}-movie`,
          title: `Top 10 Hindi Movies on ${platformLabel(platform)}`,
          subtitle: 'Trending movies with Hindi audio',
          items: movies.map((item) => mapCurrentItem(item)),
        },
        {
          id: `top10-hindi-${platform}-tv`,
          title: `Top 10 Hindi Web Series on ${platformLabel(platform)}`,
          subtitle: 'Trending Indian and Hindi series',
          items: series.map((item) => mapCurrentItem(item)),
        },
      ]));
      return { mode: 'netmirror', sections: sections.filter((section) => section.items.length > 0) };
    }

    const mediaType = view === 'tv' ? 'tv' : 'movie';
    const currentYear = new Date().getUTCFullYear();
    const requests = [
      getCurrentNetMirrorHome().then((rails) => {
        const wanted = mediaType === 'tv' ? 'popular series' : 'popular movie';
        return rails.find((rail) => rail.title.toLowerCase().includes(wanted))?.items || [];
      }).catch(() => discoverCurrentNetMirror({
          type: mediaType,
          region,
          sort: 'release',
          yearFrom: Math.max(1900, currentYear - 1),
          yearTo: currentYear,
        })),
      ...platforms.map((platform) => discoverCurrentNetMirror({
        type: mediaType,
        region,
        platform,
        sort: 'popularity',
      })),
    ];
    const results = await Promise.allSettled(requests);
    const latest = results[0].status === 'fulfilled' ? results[0].value : [];
    const sections: HomeSection[] = [{
      id: `latest-${mediaType}`,
      title: mediaType === 'tv' ? 'Latest Updated Web Series' : 'Latest Updated Movies',
      subtitle: mediaType === 'tv' ? 'Fresh seasons and recently updated shows' : 'Recently added and updated',
      items: latest.slice(0, 20).map((item) => mapCurrentItem(
        item,
        item.tmdbId > 0 ? undefined : `subject:${item.subjectId}`,
      )),
    }];

    platforms.forEach((platform, index) => {
      const result = results[index + 1];
      const items = result?.status === 'fulfilled' ? result.value : [];
      sections.push({
        id: `top10-${platform}-${mediaType}`,
        title: `Top 10 on ${platformLabel(platform)}`,
        subtitle: mediaType === 'tv' ? 'Popular web series right now' : 'Popular movies right now',
        items: items.slice(0, 10).map((item) => mapCurrentItem(item)),
      });
    });

    return {
      mode: 'netmirror',
      sections: sections.filter((section) => section.items.length > 0),
    };
  } catch (error) {
    console.error('NetMirror home failed:', error);
    return { mode: 'netmirror', sections: [] };
  }
}

export async function searchCatalog(
  query: string,
  filter: 'all' | 'movie' | 'tv' = 'all',
  _region = 'IN',
): Promise<{ mode: 'netmirror'; results: MediaItem[] }> {
  if (!query.trim()) return { mode: 'netmirror', results: [] };
  try {
    const results = (await searchCurrentNetMirror(query))
      .filter((item) => filter === 'all' || item.type === filter)
      .map((item) => mapCurrentItem(item));
    return { mode: 'netmirror', results };
  } catch (error) {
    console.error('NetMirror search failed:', error);
    return { mode: 'netmirror', results: [] };
  }
}

export async function getMediaDetails(type: MediaType, id: string): Promise<MediaDetails | null> {
  try {
    const resolved = await resolveCurrentNetMirrorStream({
      providerId: id,
      title: `NetMirror ${id}`,
      type,
    });
    return {
      id: `netmirror-${id}`,
      providerId: id,
      mediaType: resolved.type,
      title: resolved.title,
      overview: resolved.overview,
      year: resolved.year,
      rating: resolved.rating,
      posterUrl: proxiedImage(resolved.posterUrl),
      backdropUrl: null,
      genres: [],
      durationSeconds: 0,
      language: 'en',
      playback: {
        kind: 'direct',
        label: resolved.resolution,
        url: proxiedMediaPath(resolved.streamUrl),
        downloadUrl: proxiedMediaPath((resolved.streams.find((stream) => stream.resolution === '360p') || resolved.streams.find((stream) => stream.resolution === '480p') || resolved.streams.at(-1))?.url || resolved.streamUrl),
        mimeType: 'video/mp4',
        downloadable: true,
        resolvedAt: Date.now(),
        selectedAudio: resolved.audioLanguage?.replace(/\s+dub$/i, '') || 'Original',
      },
      related: [],
    };
  } catch (error) {
    console.error('NetMirror details failed:', error);
    return null;
  }
}

export async function getRelatedMedia(_type: MediaType, _id: string): Promise<MediaItem[]> {
  return [];
}
