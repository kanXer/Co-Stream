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

// Genre IDs used by NetMirror discover (TMDB genre IDs)
const GENRE_SECTIONS: Array<{ genre: string; title: string; subtitle: string; type: 'movie' | 'tv' | 'both' }> = [
  { genre: 'Action',          title: '💥 Action Blockbusters',        subtitle: 'High-octane movies & shows',             type: 'movie' },
  { genre: 'Comedy',          title: '😂 Comedy Hits',                subtitle: 'Laugh-out-loud picks',                   type: 'movie' },
  { genre: 'Thriller',        title: '🔪 Thrillers & Suspense',       subtitle: 'Edge-of-your-seat drama',                type: 'both'  },
  { genre: 'Romance',         title: '💕 Romance & Drama',            subtitle: 'Love stories you can\'t miss',           type: 'both'  },
  { genre: 'Horror',          title: '👻 Horror & Dark',              subtitle: 'Spine-chilling watch list',              type: 'both'  },
  { genre: 'Animation',       title: '🎨 Animation & Family',         subtitle: 'For every age group',                   type: 'both'  },
  { genre: 'Science Fiction', title: '🚀 Sci-Fi & Fantasy',           subtitle: 'Beyond imagination',                    type: 'both'  },
  { genre: 'Documentary',     title: '🎥 Documentaries',              subtitle: 'True stories & real world',             type: 'both'  },
  { genre: 'Crime',           title: '🕵️ Crime & Mystery',            subtitle: 'Whodunit and heist dramas',             type: 'both'  },
  { genre: 'Family',          title: '👨‍👩‍👧 Family Watch',              subtitle: 'Movies everyone can enjoy',             type: 'movie' },
];

export const isTmdbConfigured = false;

// ─── Genre section definitions ───────────────────────────────────────────────
const GENRE_SECTIONS_MOVIE: Array<{ genre: string; title: string; subtitle: string }> = [
  { genre: 'Action',          title: '💥 Action Blockbusters',   subtitle: 'High-octane action movies'          },
  { genre: 'Comedy',          title: '😂 Comedy Hits',           subtitle: 'Laugh-out-loud picks'               },
  { genre: 'Thriller',        title: '🔪 Thrillers & Suspense',  subtitle: 'Edge-of-your-seat movies'           },
  { genre: 'Romance',         title: '💕 Romance & Drama',       subtitle: 'Love stories you can\'t miss'       },
  { genre: 'Horror',          title: '👻 Horror & Dark',         subtitle: 'Spine-chilling movies'              },
  { genre: 'Science Fiction', title: '🚀 Sci-Fi & Fantasy',      subtitle: 'Beyond imagination films'           },
  { genre: 'Crime',           title: '🕵️ Crime & Heist',         subtitle: 'Whodunit and heist dramas'          },
  { genre: 'Animation',       title: '🎨 Animation & Family',    subtitle: 'Animated movies for all ages'       },
  { genre: 'Documentary',     title: '🎥 Documentaries',         subtitle: 'True stories & real world'          },
  { genre: 'Family',          title: '👨‍👩‍👧 Family Watch',         subtitle: 'Perfect for the whole family'       },
];

const GENRE_SECTIONS_TV: Array<{ genre: string; title: string; subtitle: string }> = [
  { genre: 'Action',          title: '💥 Action Web Series',     subtitle: 'Thrilling action shows'             },
  { genre: 'Thriller',        title: '🔪 Thriller Series',       subtitle: 'Suspenseful binge-worthy shows'     },
  { genre: 'Crime',           title: '🕵️ Crime Series',          subtitle: 'Crime dramas & investigations'      },
  { genre: 'Romance',         title: '💕 Romance Series',        subtitle: 'Romantic dramas to binge'           },
  { genre: 'Horror',          title: '👻 Horror Series',         subtitle: 'Dark & scary web shows'             },
  { genre: 'Science Fiction', title: '🚀 Sci-Fi Series',         subtitle: 'Futuristic & fantasy shows'         },
  { genre: 'Documentary',     title: '🎥 Documentary Series',    subtitle: 'Real stories told brilliantly'      },
  { genre: 'Animation',       title: '🎨 Animated Series',       subtitle: 'Animated shows for all ages'        },
  { genre: 'Comedy',          title: '😂 Comedy Series',         subtitle: 'Funny and feel-good shows'          },
  { genre: 'Family',          title: '👨‍👩‍👧 Family Series',        subtitle: 'Shows for the whole family'         },
];

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

/** Like uniqueCatalogItems but also excludes items explicitly marked as non-streamable. */
function streamableCatalogItems(items: NetMirrorCatalogItem[]) {
  return uniqueCatalogItems(items).filter((item) => item.streamable !== false);
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

const globalForCatalog = globalThis as typeof globalThis & {
  __coHomeCatalogCache?: Map<string, { value: CatalogPayload; expires: number }>;
  __coPlatformHindiCache?: Map<string, { value: { movies: NetMirrorCatalogItem[]; series: NetMirrorCatalogItem[] }; expires: number }>;
  __coSpotlightCache?: Map<string, { value: MediaItem[]; expires: number }>;
};

const homeCatalogCache = globalForCatalog.__coHomeCatalogCache || new Map<string, { value: CatalogPayload; expires: number }>();
globalForCatalog.__coHomeCatalogCache = homeCatalogCache;

const platformHindiCache = globalForCatalog.__coPlatformHindiCache || new Map<string, { value: { movies: NetMirrorCatalogItem[]; series: NetMirrorCatalogItem[] }; expires: number }>();
globalForCatalog.__coPlatformHindiCache = platformHindiCache;

const spotlightCache = globalForCatalog.__coSpotlightCache || new Map<string, { value: MediaItem[]; expires: number }>();
globalForCatalog.__coSpotlightCache = spotlightCache;

/**
 * Maps a catalog item for spotlight use, using TMDB image URLs directly
 * at higher resolutions (w780 backdrop, w342 poster) — no NetMirror proxy needed.
 */
function mapSpotlightItem(item: NetMirrorCatalogItem): MediaItem {
  const providerId = `tmdb:${item.type}:${item.tmdbId}`;
  // TMDB image URLs come pre-formed as https://image.tmdb.org/t/p/<size>/<hash>
  // Upgrade to higher resolution sizes for the hero banner.
  const upgradeSize = (url: string | undefined, target: string): string | null => {
    if (!url) return null;
    // Already a full TMDB URL — just swap the size segment.
    const tmdbMatch = url.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)([^/]+)(\/.*)/);
    if (tmdbMatch) return `${tmdbMatch[1]}${target}${tmdbMatch[3]}`;
    return url;
  };
  return {
    id: `netmirror-spotlight-${providerId}`,
    providerId,
    mediaType: item.type,
    title: item.title,
    overview: item.overview || '',
    year: item.year || '—',
    rating: Number(item.rating) || 0,
    posterUrl: upgradeSize(item.poster, 'w342'),
    backdropUrl: upgradeSize(item.backdrop, 'w1280'),
    genres: [],
    durationSeconds: 0,
    language: 'hi',
    playback: null,
  };
}

// Curated big Hindi/Bollywood movies — guaranteed to appear in the banner
// when the live API doesn't return enough content with images.
const HINDI_SPOTLIGHT_FALLBACK: { tmdbId: number; title: string; year: string }[] = [
  { tmdbId: 1234139, title: 'Jailer 2',              year: '2026' },
  { tmdbId: 1213243, title: 'Toxic',                  year: '2026' },
  { tmdbId: 1109086, title: 'War 2',                  year: '2025' },
  { tmdbId: 857598,  title: 'Pushpa 2 - The Rule',    year: '2024' },
  { tmdbId: 801688,  title: 'Kalki 2898-AD',          year: '2024' },
  { tmdbId: 1112426, title: 'Stree 2',                year: '2024' },
  { tmdbId: 1014214, title: 'Singham Again',          year: '2024' },
  { tmdbId: 1064213, title: 'Animal',                 year: '2023' },
  { tmdbId: 951534,  title: 'Jawan',                  year: '2023' },
  { tmdbId: 1010581, title: 'Pathaan',                year: '2023' },
  { tmdbId: 726045,  title: 'KGF Chapter 2',          year: '2022' },
  { tmdbId: 691033,  title: 'RRR',                    year: '2022' },
  { tmdbId: 778696,  title: 'Brahmastra Part One',    year: '2022' },
  { tmdbId: 820067,  title: 'Vikram',                 year: '2022' },
  { tmdbId: 882059,  title: 'Drishyam 2',             year: '2022' },
  { tmdbId: 748783,  title: 'The Kashmir Files',      year: '2022' },
  { tmdbId: 632747,  title: 'Sooryavanshi',           year: '2021' },
  { tmdbId: 635302,  title: 'Shershaah',              year: '2021' },
  { tmdbId: 580489,  title: 'Bhool Bhulaiyaa 2',      year: '2022' },
];

/**
 * Returns a curated list of the latest big Hindi/Bollywood movies for the home spotlight.
 * Strongly prioritises Hindi-language Indian content. Cached for 30 min.
 */
async function getSpotlightMovies(region = 'IN'): Promise<MediaItem[]> {
  const cacheKey = `spotlight:${region}`;
  const cached = spotlightCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const currentYear = new Date().getUTCFullYear();

  // Parallel: latest Hindi releases + popular Hindi + home rails (for trending rail)
  const [latestResult, popularResult, homeResult, hindiSearchResult] = await Promise.allSettled([
    discoverCurrentNetMirror({ type: 'movie', region: 'IN', country: 'IN', sort: 'release', yearFrom: currentYear - 1, yearTo: currentYear + 1 }),
    discoverCurrentNetMirror({ type: 'movie', region: 'IN', country: 'IN', sort: 'popularity' }),
    getCurrentNetMirrorHome(),
    searchCurrentNetMirror('Hindi movie 2024 2025').then((items) => items.filter((i) => i.type === 'movie')),
  ]);

  const latest  = latestResult.status  === 'fulfilled' ? latestResult.value  : [];
  const popular = popularResult.status === 'fulfilled' ? popularResult.value : [];
  const homeRails = homeResult.status  === 'fulfilled' ? homeResult.value    : [];
  const hindiSearchItems = hindiSearchResult.status === 'fulfilled' ? hindiSearchResult.value : [];

  // Extract "trending / new release / bollywood / hindi" rails from home feed
  const hindiRailItems = homeRails
    .filter((rail) => /trending|new release|bollywood|hindi|indian/i.test(rail.title))
    .flatMap((rail) => rail.items)
    .filter((item) => item.type === 'movie');

  // Score each item: prefer latest year, must have poster or backdrop
  function scoreItem(item: NetMirrorCatalogItem, sourceBonus: number) {
    const yr = Number(item.year) || 0;
    const yearScore = yr >= currentYear ? 30 : yr >= currentYear - 1 ? 20 : yr >= currentYear - 2 ? 10 : 0;
    const imageScore = (item.poster || item.backdrop) ? 15 : -999; // must have image
    const ratingScore = Math.min(Number(item.rating) || 0, 10) * 2;
    return yearScore + imageScore + ratingScore + sourceBonus;
  }

  // Merge candidates — order: latest > hindi rails > popular > search
  const candidates: Array<{ item: NetMirrorCatalogItem; score: number }> = [];
  const seen = new Set<number>();

  const addItems = (items: NetMirrorCatalogItem[], sourceBonus: number) => {
    for (const item of items) {
      if (!item.tmdbId || seen.has(item.tmdbId)) continue;
      if (!item.poster && !item.backdrop) continue;
      seen.add(item.tmdbId);
      candidates.push({ item, score: scoreItem(item, sourceBonus) });
    }
  };

  addItems(latest,          25); // latest IN releases — highest priority
  addItems(hindiRailItems,  20); // trending Hindi rails
  addItems(hindiSearchItems,15); // Hindi keyword search
  addItems(popular,         10); // popular IN movies

  // Sort by score descending, pick top 8
  candidates.sort((a, b) => b.score - a.score);
  const merged: NetMirrorCatalogItem[] = candidates.slice(0, 8).map((c) => c.item);

  // Pad with curated fallback if still < 6 good items
  for (const fb of HINDI_SPOTLIGHT_FALLBACK) {
    if (merged.length >= 8) break;
    if (seen.has(fb.tmdbId)) continue;
    seen.add(fb.tmdbId);
    merged.push({ tmdbId: fb.tmdbId, title: fb.title, year: fb.year, type: 'movie' } as NetMirrorCatalogItem);
  }

  const items = merged.slice(0, 6).map(mapSpotlightItem);

  if (spotlightCache.size > 50) spotlightCache.clear();
  spotlightCache.set(cacheKey, { value: items, expires: Date.now() + 30 * 60 * 1000 });
  return items;
}

async function getPlatformHindiRows(platform: StreamingPlatformId, region: string) {
  const cacheKey = `${platform}:${region}`;
  const cached = platformHindiCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const [curatedResult, movieResult, seriesResult] = await Promise.allSettled([
    getCurrentNetMirrorCurated(platform),
    discoverCurrentNetMirror({ type: 'movie', region, platform, sort: 'popularity' }),
    discoverCurrentNetMirror({ type: 'tv', region, platform, country: 'IN', sort: 'popularity' }),
  ]);
  const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
  const platformMovies = movieResult.status === 'fulfilled' ? movieResult.value : [];
  const platformSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];
  const hindiMovieRails = curated.filter((rail) => /hindi|bollywood|indian/i.test(rail.title));
  const curatedMovies = streamableCatalogItems(hindiMovieRails.flatMap((rail) => rail.items).filter((item) => item.type === 'movie'));
  const movies = await fillHindiAudioTitles(curatedMovies, streamableCatalogItems(platformMovies), 'movie');
  const series = streamableCatalogItems(platformSeries).slice(0, 10);
  const result = { movies, series };

  if (platformHindiCache.size > 100) platformHindiCache.clear();
  platformHindiCache.set(cacheKey, { value: result, expires: Date.now() + 20 * 60 * 1000 });
  return result;
}

export async function getHomeCatalog(
  region = 'IN',
  _language = 'hi',
  requestedPlatforms: string[] = ['Netflix', 'PrimeVideo'],
  view: 'home' | 'movie' | 'tv' = 'home',
): Promise<CatalogPayload> {
  const platforms = requestedPlatforms.filter(isStreamingPlatformId) as StreamingPlatformId[];
  const platformsKey = platforms.join(',');
  const cacheKey = `${region}:${_language}:${platformsKey}:${view}`;
  const cached = homeCatalogCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  try {
    if (view === 'home') {
      const [platformRows, spotlight] = await Promise.all([
        Promise.all(platforms.map(async (platform) => ({
          platform,
          ...(await getPlatformHindiRows(platform, region)),
        }))),
        getSpotlightMovies(region),
      ]);
      const sections = platformRows.flatMap(({ platform, movies, series }) => ([
        {
          id: `top10-hindi-${platform}-movie`,
          title: `Top 10 Hindi Movies on ${platformLabel(platform)}`,
          subtitle: 'Trending movies with Hindi audio',
          items: streamableCatalogItems(movies).map((item) => mapCurrentItem(item)),
        },
        {
          id: `top10-hindi-${platform}-tv`,
          title: `Top 10 Hindi Web Series on ${platformLabel(platform)}`,
          subtitle: 'Trending Indian and Hindi series',
          items: streamableCatalogItems(series).map((item) => mapCurrentItem(item)),
        },
      ]));
      const payload: CatalogPayload = { mode: 'netmirror', sections: sections.filter((section) => section.items.length > 0), spotlight };
      if (homeCatalogCache.size > 100) homeCatalogCache.clear();
      homeCatalogCache.set(cacheKey, { value: payload, expires: Date.now() + 15 * 60 * 1000 });
      return payload;
    }

    const mediaType = view === 'tv' ? 'tv' : 'movie';
    const currentYear = new Date().getUTCFullYear();
    const genreSections = mediaType === 'movie' ? GENRE_SECTIONS_MOVIE : GENRE_SECTIONS_TV;

    // Parallel fetches: latest + platform top10s + genre discovers + year-based
    const [
      latestResult,
      ...restResults
    ] = await Promise.allSettled([
      // 1. Latest/recently updated
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
      // 2. Platform top-10s
      ...platforms.map((platform) => discoverCurrentNetMirror({
        type: mediaType,
        region,
        platform,
        sort: 'popularity',
      })),
      // 3. This year's releases (by rating)
      discoverCurrentNetMirror({ type: mediaType, region, sort: 'rating', yearFrom: currentYear, yearTo: currentYear + 1 }),
      // 4. Last year's best
      discoverCurrentNetMirror({ type: mediaType, region, sort: 'rating', yearFrom: currentYear - 1, yearTo: currentYear }),
      // 5. All-time popular
      discoverCurrentNetMirror({ type: mediaType, region, sort: 'popularity' }),
      // 6–15. Genre searches
      ...genreSections.map((g) => searchCurrentNetMirror(g.genre).then((items) =>
        items.filter((item) => item.type === mediaType)
      )),
    ]);

    const latest = latestResult.status === 'fulfilled' ? latestResult.value : [];
    const platformResults = restResults.slice(0, platforms.length);
    const thisYearResult = restResults[platforms.length];
    const lastYearResult = restResults[platforms.length + 1];
    const popularResult = restResults[platforms.length + 2];
    const thisYearItems = thisYearResult?.status === 'fulfilled' ? thisYearResult.value : [];
    const lastYearItems = lastYearResult?.status === 'fulfilled' ? lastYearResult.value : [];
    const popularItems = popularResult?.status === 'fulfilled' ? popularResult.value : [];
    const genreResults = restResults.slice(platforms.length + 3);

    const sections: HomeSection[] = [];

    // Section 1: Latest updated
    if (latest.length) {
      sections.push({
        id: `latest-${mediaType}`,
        title: mediaType === 'tv' ? '🆕 Latest Updated Web Series' : '🆕 Latest Updated Movies',
        subtitle: mediaType === 'tv' ? 'Fresh seasons and recently updated shows' : 'Recently added and updated',
        items: streamableCatalogItems(latest).slice(0, 20).map((item) => mapCurrentItem(item)),
      });
    }

    // Section 2: This year's top rated
    if (thisYearItems.length) {
      sections.push({
        id: `top-rated-${currentYear}-${mediaType}`,
        title: mediaType === 'tv' ? `⭐ Best Series of ${currentYear}` : `⭐ Best Movies of ${currentYear}`,
        subtitle: `Highest rated ${mediaType === 'tv' ? 'shows' : 'films'} of the year`,
        items: streamableCatalogItems(thisYearItems).slice(0, 15).map((item) => mapCurrentItem(item)),
      });
    }

    // Section 3: Platform top-10s
    platforms.forEach((platform, index) => {
      const result = platformResults[index];
      const items = result?.status === 'fulfilled' ? result.value : [];
      if (items.length) {
        sections.push({
          id: `top10-${platform}-${mediaType}`,
          title: `🏆 Top 10 on ${platformLabel(platform)}`,
          subtitle: mediaType === 'tv' ? `Popular ${platformLabel(platform)} web series right now` : `Popular ${platformLabel(platform)} movies right now`,
          items: streamableCatalogItems(items).slice(0, 10).map((item) => mapCurrentItem(item)),
        });
      }
    });

    // Section 4: Last year's best
    if (lastYearItems.length) {
      sections.push({
        id: `top-rated-${currentYear - 1}-${mediaType}`,
        title: mediaType === 'tv' ? `🎬 Best Series of ${currentYear - 1}` : `🎬 Best Movies of ${currentYear - 1}`,
        subtitle: `Top rated ${mediaType === 'tv' ? 'shows' : 'films'} from last year`,
        items: streamableCatalogItems(lastYearItems).slice(0, 15).map((item) => mapCurrentItem(item)),
      });
    }

    // Section 5: All-time popular
    if (popularItems.length) {
      sections.push({
        id: `popular-all-${mediaType}`,
        title: mediaType === 'tv' ? '🔥 Most Popular Web Series' : '🔥 Most Popular Movies',
        subtitle: 'All-time fan favourites',
        items: streamableCatalogItems(popularItems).slice(0, 20).map((item) => mapCurrentItem(item)),
      });
    }

    // Sections 6–15: Genre-wise
    genreSections.forEach((genreDef, index) => {
      const result = genreResults[index];
      const items = result?.status === 'fulfilled' ? result.value : [];
      if (items.length >= 4) {
        sections.push({
          id: `genre-${genreDef.genre.toLowerCase().replace(/\s+/g, '-')}-${mediaType}`,
          title: genreDef.title,
          subtitle: genreDef.subtitle,
          items: streamableCatalogItems(items).slice(0, 15).map((item) => mapCurrentItem(item)),
        });
      }
    });

    const payload: CatalogPayload = {
      mode: 'netmirror',
      sections: sections.filter((section) => section.items.length > 0),
    };
    if (homeCatalogCache.size > 100) homeCatalogCache.clear();
    homeCatalogCache.set(cacheKey, { value: payload, expires: Date.now() + 15 * 60 * 1000 });
    return payload;
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
        mimeType: resolved.streamUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
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
