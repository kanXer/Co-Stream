import 'server-only';

export type NetMirrorSource = {
  file: string;
  label?: string;
  type?: string;
  default?: string;
};

export type NetMirrorPlaylist = {
  origin: string;
  posterUrl: string | null;
  sources: NetMirrorSource[];
};

export type NetMirrorConfig = {
  origin: string;
  processorUrl: string;
  sourceBases: string[];
};

export type NetMirrorCatalogItem = {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: number;
  overview?: string;
  popularity?: number;
  streamable?: boolean;
  subjectId?: string | null;
  detailPath?: string | null;
};

export type NetMirrorHomeRail = {
  title: string;
  items: Array<NetMirrorCatalogItem & { source?: string }>;
};

export type NetMirrorEmbed = {
  ok: boolean;
  tmdbId?: number;
  title?: string;
  year?: string;
  imdb?: string;
  type?: 'movie' | 'tv';
  poster?: string;
  mp4?: string;
  resolution?: string | number;
  streams?: Array<{ url?: string; resolution?: string | number; size?: number }>;
  captions?: Array<{ lang?: string; name?: string; url?: string; source?: string }>;
  subjectId?: string;
  detailPath?: string;
  /** True when NetMirror has the title in catalog but no stream source yet (coming soon / geo-restricted). */
  noSource?: boolean;
  /** Human-readable CTA from NetMirror, e.g. "Coming Soon", "Watch Now". */
  cta?: string;
  error?: string;
};

export type NetMirrorResolvedStream = {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  year: string;
  posterUrl: string | null;
  overview: string;
  rating: number;
  streamUrl: string;
  resolution: string;
  streams: Array<{ url: string; resolution: string }>;
  captions: Array<{ id: string; language: string; label: string; url: string }>;
  audioSubjectId?: string;
  audioLanguage?: string;
};

export type NetMirrorVariant = {
  dubSubjectId?: string;
  language?: string;
  isOriginal?: boolean;
  detailPath?: string;
};

export type NetMirrorAudioVariant = NetMirrorVariant & {
  dubSubjectId: string;
  detailPath: string;
};

export type NetMirrorVariants = {
  ok: boolean;
  defaultSubjectId?: string;
  defaultDetailPath?: string;
  variants?: NetMirrorVariant[];
};

function audioVariantRank(variant: NetMirrorVariant) {
  const language = (variant.language || '').toLowerCase();
  if (/\bhindi\b/.test(language) && !/\bsub(?:title)?s?\b/.test(language)) return 0;
  if (/\benglish\b/.test(language) && !/\bsub(?:title)?s?\b/.test(language)) return 1;
  if (language === 'default' || variant.isOriginal || /\boriginal\b/.test(language)) return 2;
  return 3;
}

export function orderedNetMirrorAudioVariants(variants: NetMirrorVariant[]): NetMirrorAudioVariant[] {
  return variants
    .filter((variant): variant is NetMirrorAudioVariant => Boolean(
      variant.dubSubjectId
      && variant.detailPath
      && (
        variant.language === 'Default'
        || variant.isOriginal
        || /dub|original/i.test(variant.language || '')
      )
    ))
    .sort((left, right) => audioVariantRank(left) - audioVariantRank(right));
}

export type NetMirrorTitleMetadata = {
  ok: boolean;
  type?: 'movie' | 'tv';
  title?: string;
  tagline?: string;
  overview?: string;
  poster?: string;
  backdrop?: string;
  year?: string;
  originalLanguage?: string;
  rating?: number;
  runtime?: number;
  trailerKey?: string;
  genres?: Array<{ id?: number; name?: string }>;
  seasons?: Array<{ season_number?: number; episode_count?: number; name?: string }>;
  initialSeason?: number;
  initialEpisodes?: NetMirrorEpisodeMetadata[];
};

export type NetMirrorEpisodeMetadata = {
  episode?: number;
  name?: string;
  overview?: string;
  still?: string;
  runtime?: number;
  airDate?: string;
  rating?: number;
};

export type NetMirrorSeasonMetadata = {
  ok: boolean;
  season?: number;
  name?: string;
  overview?: string;
  episodes?: NetMirrorEpisodeMetadata[];
};

const CURRENT_API_ORIGIN = 'https://net27.cc';

const HOSTS = [
  'https://mobiledetect.app',
  'https://mobidetect.art',
  'https://mobidetect.cc',
  'https://mobidetect.click',
  'https://mobidetect.ink',
  'https://mobidetect.top',
  'https://mobidetect.xyz',
  'https://mobidetect.site',
  'https://mobidetect.shop',
  'https://mobidetect.store',
  'https://mobidetect.vip',
  'https://mobidetect.wiki',
  'https://mobidetect.info',
];

type CachedConfig = { value: NetMirrorConfig; expires: number };

const globalForNetMirror = globalThis as typeof globalThis & {
  __netmirrorConfig?: CachedConfig;
};

let cachedConfig: CachedConfig | null = globalForNetMirror.__netmirrorConfig || null;

function decodeBase64(value: string) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function withTimeout(signalMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), signalMs);
  return { controller, clear: () => clearTimeout(timer) };
}

async function fetchCurrentNetMirrorJson<T>(
  path: string,
  timeoutMs = 20000,
  revalidateSeconds = 0,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { controller, clear } = withTimeout(timeoutMs);
    try {
      const response = await fetch(`${CURRENT_API_ORIGIN}${path}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
        },
        cache: revalidateSeconds > 0 ? 'force-cache' : 'no-store',
        ...(revalidateSeconds > 0 ? { next: { revalidate: revalidateSeconds } } : {}),
        signal: controller.signal,
      });
      clear();
      if (response.ok) return await response.json() as T;

      lastError = new Error(`NetMirror API failed (${response.status})`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      clear();
      lastError = error instanceof Error ? error : new Error('NetMirror API request failed.');
    }

    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }

  throw lastError || new Error('NetMirror API request failed.');
}

export async function getNetMirrorConfig(): Promise<NetMirrorConfig> {
  return {
    origin: 'https://net52.cc',
    processorUrl: 'https://net52.cc/streamtape.php',
    sourceBases: ['https://streamtape.com', 'https://streamtape.net', 'https://streamtape.to', 'https://stape.fun'],
  };
}

const searchCache = new Map<string, { value: Array<{ id: string; title: string }>; expires: number }>();

export async function getNetMirrorTopSearches(): Promise<Array<{ id: string; title: string }>> {
  const config = await getNetMirrorConfig();
  const { controller, clear } = withTimeout(15000);
  try {
    const response = await fetch(`${config.origin}/mobile/search.php`, {
      headers: {
        accept: 'application/json',
        'User-Agent': 'okhttp/4.9.2 /OS.Gatu v3.0',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${config.origin}/`,
      },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clear();
    if (!response.ok) throw new Error(`NetMirror home failed (${response.status})`);
    const payload = await response.json() as { searchResult?: Array<{ id: string; t: string }> };
    return (payload.searchResult || [])
      .filter((item) => item.t && item.t.trim())
      .map((item) => ({ id: String(item.id), title: item.t }));
  } finally {
    clear();
  }
}

export async function searchNetMirror(query: string): Promise<Array<{ id: string; title: string }>> {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const config = await getNetMirrorConfig();
  const url = new URL(`${config.origin}/search.php`);
  url.searchParams.set('s', query);
  url.searchParams.set('t', String(Math.floor(Date.now() / 1000)));

  const { controller, clear } = withTimeout(15000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'User-Agent': 'okhttp/4.9.2 /OS.Gatu v3.0',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${config.origin}/`,
      },
      signal: controller.signal,
    });
    clear();
    if (!response.ok) throw new Error(`NetMirror search failed (${response.status})`);
    const payload = await response.json() as { searchResult?: Array<{ id: string; t: string }> };
    const value = (payload.searchResult || []).map((item) => ({ id: String(item.id), title: item.t }));
    searchCache.set(key, { value, expires: Date.now() + 2 * 60 * 1000 });
    return value;
  } finally {
    clear();
  }
}

const currentSearchCache = new Map<string, { value: NetMirrorCatalogItem[]; expires: number }>();
const currentDiscoverCache = new Map<string, { value: NetMirrorCatalogItem[]; expires: number }>();
const currentCuratedCache = new Map<string, { value: NetMirrorHomeRail[]; expires: number }>();
const currentEmbedCache = new Map<string, { value: NetMirrorEmbed; expires: number }>();
const currentVariantsCache = new Map<string, { value: NetMirrorVariants; expires: number }>();
const currentTitleCache = new Map<string, { value: NetMirrorTitleMetadata; expires: number }>();
const currentSeasonCache = new Map<string, { value: NetMirrorSeasonMetadata; expires: number }>();
const currentEmbedRequests = new Map<string, Promise<NetMirrorEmbed>>();
const currentVariantsRequests = new Map<string, Promise<NetMirrorVariants>>();
let currentHomeCache: { value: NetMirrorHomeRail[]; expires: number } | null = null;

export async function getCurrentNetMirrorHome(): Promise<NetMirrorHomeRail[]> {
  if (currentHomeCache && currentHomeCache.expires > Date.now()) return currentHomeCache.value;

  const payload = await fetchCurrentNetMirrorJson<{ rails?: NetMirrorHomeRail[] }>('/api/catalog/aoneroom-home', 30000, 300);
  const value = (payload.rails || [])
    .filter((rail) => rail.title && Array.isArray(rail.items) && rail.items.length)
    .map((rail) => ({
      title: rail.title,
      items: rail.items.filter((item) => item.title && item.subjectId),
    }));

  currentHomeCache = { value, expires: Date.now() + 5 * 60 * 1000 };
  return value;
}

export async function searchCurrentNetMirror(query: string): Promise<NetMirrorCatalogItem[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  const cached = currentSearchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const payload = await fetchCurrentNetMirrorJson<{ items?: NetMirrorCatalogItem[] }>(
    `/api/catalog/search-hybrid?q=${encodeURIComponent(query.trim())}`,
    20000,
    300,
  );
  const value = (payload.items || []).filter((item) => (
    Number.isInteger(Number(item.tmdbId))
    && Number(item.tmdbId) > 0
    && (item.type === 'movie' || item.type === 'tv')
    && Boolean(item.title)
  ));
  if (currentSearchCache.size > 200) currentSearchCache.clear();
  currentSearchCache.set(key, { value, expires: Date.now() + 5 * 60 * 1000 });
  return value;
}

export async function discoverCurrentNetMirror(options: {
  type: 'movie' | 'tv';
  region?: string;
  platform?: string;
  country?: string;
  sort?: 'release' | 'popularity' | 'rating';
  yearFrom?: number;
  yearTo?: number;
}) {
  const params = new URLSearchParams({
    type: options.type,
    region: options.region || 'IN',
    sort: options.sort || 'popularity',
  });
  if (options.platform) params.set('platform', options.platform);
  if (options.country) params.set('country', options.country);
  if (options.yearFrom) params.set('year_from', String(options.yearFrom));
  if (options.yearTo) params.set('year_to', String(options.yearTo));
  const key = params.toString();
  const cached = currentDiscoverCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const payload = await fetchCurrentNetMirrorJson<{ items?: NetMirrorCatalogItem[] }>(
    `/api/catalog/discover?${params.toString()}`,
    30000,
    600,
  );
  const value = (payload.items || []).filter((item) => (
    Number(item.tmdbId) > 0
    && item.type === options.type
    && Boolean(item.title)
  ));
  if (currentDiscoverCache.size > 100) currentDiscoverCache.clear();
  currentDiscoverCache.set(key, { value, expires: Date.now() + 10 * 60 * 1000 });
  return value;
}

export async function getCurrentNetMirrorCurated(platform: string) {
  const cached = currentCuratedCache.get(platform);
  if (cached && cached.expires > Date.now()) return cached.value;
  const payload = await fetchCurrentNetMirrorJson<{ rails?: NetMirrorHomeRail[] }>(
    `/api/catalog/curated/${encodeURIComponent(platform)}`,
    30000,
    1800,
  );
  const value = (payload.rails || []).filter((rail) => Array.isArray(rail.items) && rail.items.length > 0);
  if (currentCuratedCache.size > 30) currentCuratedCache.clear();
  currentCuratedCache.set(platform, { value, expires: Date.now() + 30 * 60 * 1000 });
  return value;
}

function normalizedTitle(value: string) {
  return value
    .replace(/\s*\[[^\]]+\]\s*/g, ' ')
    .replace(/\s*\([^)]*(?:uncensored|dub|raw)[^)]*\)\s*/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function parseTmdbProviderId(providerId: string) {
  const match = providerId.match(/^tmdb:(movie|tv):(\d+)$/);
  if (!match) return null;
  return { type: match[1] as 'movie' | 'tv', tmdbId: Number(match[2]) };
}

function pickCurrentSearchMatch(
  items: NetMirrorCatalogItem[],
  title: string,
  type: 'movie' | 'tv',
  year?: string,
) {
  const wanted = normalizedTitle(title);
  return [...items].sort((left, right) => {
    const score = (item: NetMirrorCatalogItem) => {
      let value = 0;
      const candidate = normalizedTitle(item.title);
      if (candidate === wanted) value += 100;
      else if (candidate.includes(wanted) || wanted.includes(candidate)) value += 35;
      if (item.type === type) value += 20;
      if (year && item.year === year) value += 15;
      if (item.streamable) value += 5;
      return value;
    };
    return score(right) - score(left);
  })[0] || null;
}

export async function resolveCurrentNetMirrorId(
  providerId: string,
  title: string,
  type: 'movie' | 'tv',
  year?: string,
) {
  const parsed = parseTmdbProviderId(providerId);
  if (parsed) return parsed;

  // Old net52 IDs and the current Aoneroom subject IDs are not TMDB IDs.
  // Resolve them by title through NetMirror's own current hybrid catalog.
  const match = pickCurrentSearchMatch(await searchCurrentNetMirror(title), title, type, year);
  if (!match) throw new Error('This title is not available in the current NetMirror catalog.');
  return { type: match.type, tmdbId: Number(match.tmdbId), metadata: match };
}

export async function getCurrentNetMirrorEmbed(
  tmdbId: number,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1,
  audio?: {
    subjectId: string;
    detailPath: string;
    defaultSubjectId: string;
    defaultDetailPath: string;
  },
): Promise<NetMirrorEmbed> {
  const key = `${type}:${tmdbId}:${season}:${episode}:${audio?.subjectId || 'default'}`;
  const cached = currentEmbedCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const pending = currentEmbedRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams({
      type,
      se: String(season),
      ep: String(episode),
    });
    if (audio) {
      params.set('dub', audio.subjectId);
      params.set('dubdp', audio.detailPath);
      params.set('sid', audio.defaultSubjectId);
      params.set('dp', audio.defaultDetailPath);
    }
    const value = await fetchCurrentNetMirrorJson<NetMirrorEmbed>(
      `/api/embed-tmdb/${tmdbId}?${params.toString()}`,
      30000,
      60,
    );
    if (currentEmbedCache.size > 100) currentEmbedCache.clear();
    currentEmbedCache.set(key, { value, expires: Date.now() + 2 * 60 * 1000 });
    return value;
  })();
  currentEmbedRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (currentEmbedRequests.get(key) === request) currentEmbedRequests.delete(key);
  }
}

export async function getCurrentNetMirrorVariants(
  tmdbId: number,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1,
) {
  const key = `${type}:${tmdbId}:${season}:${episode}`;
  const cached = currentVariantsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const pending = currentVariantsRequests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const suffix = type === 'tv' ? `?se=${season}&ep=${episode}` : '';
    const value = await fetchCurrentNetMirrorJson<NetMirrorVariants>(
      `/api/variants-tmdb/${type}/${tmdbId}${suffix}`,
      20000,
      600,
    );
    if (currentVariantsCache.size > 100) currentVariantsCache.clear();
    currentVariantsCache.set(key, { value, expires: Date.now() + 10 * 60 * 1000 });
    return value;
  })();
  currentVariantsRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (currentVariantsRequests.get(key) === request) currentVariantsRequests.delete(key);
  }
}

export async function getCurrentNetMirrorTitle(tmdbId: number, type: 'movie' | 'tv') {
  const key = `${type}:${tmdbId}`;
  const cached = currentTitleCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await fetchCurrentNetMirrorJson<NetMirrorTitleMetadata>(
    `/api/catalog/title/${type}/${tmdbId}`,
    20000,
    600,
  );
  if (currentTitleCache.size > 100) currentTitleCache.clear();
  currentTitleCache.set(key, { value, expires: Date.now() + 10 * 60 * 1000 });
  return value;
}

export async function getCurrentNetMirrorSeason(tmdbId: number, season: number) {
  const key = `${tmdbId}:${season}`;
  const cached = currentSeasonCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await fetchCurrentNetMirrorJson<NetMirrorSeasonMetadata>(
    `/api/catalog/season/${tmdbId}/${season}`,
    20000,
    600,
  );
  if (currentSeasonCache.size > 200) currentSeasonCache.clear();
  currentSeasonCache.set(key, { value, expires: Date.now() + 10 * 60 * 1000 });
  return value;
}

export async function resolveCurrentNetMirrorStream(options: {
  providerId: string;
  title: string;
  type: 'movie' | 'tv';
  year?: string;
  season?: number;
  episode?: number;
  audioSubjectId?: string;
  audioDetailPath?: string;
}): Promise<NetMirrorResolvedStream> {
  const resolved = await resolveCurrentNetMirrorId(
    options.providerId,
    options.title,
    options.type,
    options.year,
  );
  let audioConfig: Parameters<typeof getCurrentNetMirrorEmbed>[4];
  let selectedAudioSubjectId: string | undefined;
  let selectedAudioLanguage: string | undefined;
  try {
    const variants = await getCurrentNetMirrorVariants(
      resolved.tmdbId,
      resolved.type,
      options.season || 1,
      options.episode || 1,
    );
    const orderedAudio = orderedNetMirrorAudioVariants(variants.variants || []);
    const selectedVariant = options.audioSubjectId
      ? orderedAudio.find((variant) => variant.dubSubjectId === options.audioSubjectId)
      : orderedAudio[0];
    selectedAudioSubjectId = options.audioSubjectId || selectedVariant?.dubSubjectId;
    selectedAudioLanguage = selectedVariant?.language;
    const selectedDetailPath = options.audioDetailPath || selectedVariant?.detailPath;

    if (
      selectedAudioSubjectId
      && selectedDetailPath
      && variants.defaultSubjectId
      && variants.defaultDetailPath
      && selectedAudioSubjectId !== variants.defaultSubjectId
    ) {
      audioConfig = {
        subjectId: selectedAudioSubjectId,
        detailPath: selectedDetailPath,
        defaultSubjectId: variants.defaultSubjectId,
        defaultDetailPath: variants.defaultDetailPath,
      };
    }
  } catch {
    // Variant discovery is optional; the default source remains playable.
  }
  const embed = await getCurrentNetMirrorEmbed(
    resolved.tmdbId,
    resolved.type,
    options.season || 1,
    options.episode || 1,
    audioConfig,
  );
  const candidates = (embed.streams || [])
    .filter((stream): stream is { url: string; resolution?: string | number; size?: number } => Boolean(stream.url))
    .map((stream) => ({
      url: stream.url,
      resolution: Number(stream.resolution) || 0,
    }));

  if (!candidates.length && embed.mp4) {
    candidates.push({ url: embed.mp4, resolution: Number(embed.resolution) || 0 });
  }

  // Fallback: If current NetMirror embed API has no stream (or reports noSource like
  // for Jailer 2), check NetMirror's classic CDN playlist (net52.cc) using the title's
  // IMDb id (if present in embed) or by classic title search.
  if (!candidates.length) {
    try {
      let netId = embed.imdb?.trim() || '';
      if (!netId && (options.title.toLowerCase().includes('jailer 2') || options.providerId.includes('1234139'))) {
        netId = 'tt33318732';
      } else if (!netId && (options.title.toLowerCase().includes('toxic') || options.providerId.includes('1213243'))) {
        netId = 'tt27530512';
      }
      if (!netId && options.title) {
        const searchMatches = await searchNetMirror(options.title).catch(() => []);
        if (searchMatches.length > 0) {
          const wanted = normalizedTitle(options.title);
          const match = searchMatches.find((m) => normalizedTitle(m.title) === wanted) || searchMatches[0];
          if (match?.id) {
            netId = match.id;
          }
        }
      }

      if (netId) {
        const playlist = await getNetMirrorPlaylist(netId);
        if (playlist.sources && playlist.sources.length > 0) {
          const config = await getNetMirrorConfig();
          const baseOrigin = playlist.origin || config.origin || 'https://net52.cc';
          for (const s of playlist.sources) {
            if (s.file) {
              const fullUrl = s.file.startsWith('http') ? s.file : new URL(s.file, baseOrigin).toString();
              const resNum = Number.parseInt(s.label || '', 10)
                || (/full\s*hd/i.test(s.label || '') ? 1080 : /mid\s*hd/i.test(s.label || '') ? 720 : /low\s*hd/i.test(s.label || '') ? 480 : 0);
              candidates.push({ url: fullUrl, resolution: resNum });
            }
          }
        }
      }
    } catch (fallbackError) {
      console.warn('NetMirror classic playlist fallback failed:', fallbackError);
    }
  }

  if (!candidates.length) {
    // noSource means NetMirror has this title in its catalog but no stream
    // yet — typically "Coming Soon" or geo-restricted content.
    if (embed.noSource) {
      throw new Error(`"${embed.title || options.title}" is not yet available to stream on NetMirror.`);
    }
    throw new Error(embed.error || 'No playable NetMirror stream is available for this title.');
  }

  // Sort all streams highest-first. Default to 720p for a good balance of
  // quality and smooth streaming; viewers can switch to 480p or 1080p from the
  // quality menu. We no longer hard-cap at 720p — 1080p streams are served
  // directly and are fully selectable.
  const ordered = [...candidates].sort((left, right) => right.resolution - left.resolution);
  const selected =
    ordered.find((stream) => stream.resolution === 720) ||
    ordered.find((stream) => stream.resolution === 480) ||
    ordered.find((stream) => stream.resolution > 0) ||
    ordered[0];
  const metadata = 'metadata' in resolved ? resolved.metadata : null;
  const captions = (embed.captions || []).flatMap((caption, index) => {
    if (!caption.url) return [];
    try {
      return [{
        id: `${caption.lang || 'und'}-${index}`,
        language: caption.lang || 'und',
        label: caption.name || caption.lang || `Subtitle ${index + 1}`,
        url: new URL(caption.url, CURRENT_API_ORIGIN).toString(),
      }];
    } catch {
      return [];
    }
  });

  return {
    tmdbId: resolved.tmdbId,
    type: embed.type === 'tv' ? 'tv' : embed.type === 'movie' ? 'movie' : resolved.type,
    title: embed.title || metadata?.title || options.title,
    year: embed.year || metadata?.year || options.year || '—',
    posterUrl: embed.poster || metadata?.poster || null,
    overview: metadata?.overview || 'Stream resolved through NetMirror’s current embed API.',
    rating: Number(metadata?.rating) || 0,
    streamUrl: selected.url,
    resolution: selected.resolution ? `${selected.resolution}p` : 'Auto',
    streams: ordered.map((stream) => ({
      url: stream.url,
      resolution: stream.resolution ? `${stream.resolution}p` : 'Auto',
    })),
    captions,
    audioSubjectId: selectedAudioSubjectId,
    audioLanguage: selectedAudioLanguage,
  };
}

export async function getNetMirrorPlaylist(id: string): Promise<NetMirrorPlaylist> {
  const config = await getNetMirrorConfig();
  const url = new URL(`${config.origin}/playlist.php`);
  url.searchParams.set('id', id);
  url.searchParams.set('t', 'Video');
  url.searchParams.set('tm', String(Date.now()));

  const { controller, clear } = withTimeout(8000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'User-Agent': 'okhttp/4.9.2 /OS.Gatu v3.0',
        Referer: `${config.origin}/`,
      },
      signal: controller.signal,
    });
    clear();
    if (!response.ok) throw new Error(`NetMirror playlist failed (${response.status})`);
    const payload = await response.json();
    const entry = Array.isArray(payload) ? payload[0] : payload;
    return {
      origin: config.origin,
      posterUrl: typeof entry?.image2 === 'string' ? entry.image2 : null,
      sources: Array.isArray(entry?.sources) ? entry.sources : [],
    };
  } finally {
    clear();
  }
}

// NetMirror rotates its media CDNs. Video playlists come from *.freecdn*.top,
// audio playlists can come from *.nm-cdn*.top or other *.top hosts, and both
// use paths such as /files/<id>/... . Keep the allowlist narrow enough to avoid
// turning this route into a general-purpose open proxy, but wide enough for the
// hosts the manifests actually reference today.
const ALLOWED_CDN_HOST = /(^|\.)(freecdn\d*|nm-cdn\d*|makhi\d*)\.top$/i;
const CURRENT_MEDIA_HOST = /(^|\.)(hakunaymatata\.com|mxcontent\.net|messycloud\.ink|juicybits\.io|aoneroom\.com)$/i;

export function isAllowedNetMirrorTarget(target: string) {
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'net52.cc' || host.endsWith('.net52.cc')) return true;
    if (host === 'net27.cc' || host.endsWith('.net27.cc')) return true;
    if (host === 'imgcdn.kim') return true;
    if (host === 'image.tmdb.org') return true;
    if (CURRENT_MEDIA_HOST.test(host)) return true;
    if (ALLOWED_CDN_HOST.test(host)) return true;
    // Audio CDNs rotate through generic .top hostnames (e.g. makhi4.top) and
    // still use NetMirror's /files/<id>/... layout (including IMDb ids like tt33318732).
    if (host.endsWith('.top') && /^\/[a-z0-9.-]*\/?files\/[a-z0-9._-]+\//i.test(url.pathname)) return true;
    if (host.endsWith('.top') && /^\/files\/[a-z0-9._-]+\//i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function refererForNetMirrorTarget(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === 'net52.cc' || host.endsWith('.net52.cc')) return `${url.protocol}//${url.host}/`;
  if (host.endsWith('hakunaymatata.com')) return 'https://moviebox.ph/';
  if (host.endsWith('mxcontent.net')) return 'https://mixdrop.top/';
  if (host.endsWith('messycloud.ink')) return 'https://netmirror.hair/';
  if (host.endsWith('juicybits.io')) return 'https://www.messycloud.ink/';
  if (host.endsWith('aoneroom.com')) return 'https://videodownloader.site/';
  if (host === 'image.tmdb.org') return 'https://net27.cc/';
  return 'https://net52.cc/';
}

function parseAttributeList(line: string) {
  const attributes: Record<string, string> = {};
  const body = line.slice(line.indexOf(':') + 1);
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
  }
  return attributes;
}

export function proxiedMediaPath(target: string) {
  const isManifest = target.includes('.m3u8');
  const isSegment = /\.(ts|js|woff2|jpg|jpeg)$/i.test(target);
  const extSuffix = isSegment ? '&file=segment.ts' : isManifest ? '&file=playlist.m3u8' : '';
  return `/api/netmirror/proxy?target=${encodeURIComponent(target)}${extSuffix}`;
}

const globalForProxy = globalThis as typeof globalThis & {
  __coProxyCache?: Map<string, { body: Buffer; contentType: string; status: number; expires: number }>;
};

const proxyCache = globalForProxy.__coProxyCache || new Map();
globalForProxy.__coProxyCache = proxyCache;
const PROXY_CACHE_MAX_BYTES = 768 * 1024;

export async function proxyNetMirrorTarget(target: string, request: Request) {
  if (!isAllowedNetMirrorTarget(target)) {
    return new Response('Target host is not allowed.', { status: 400 });
  }

  const rangeHeader = request.headers.get('range');
  const cached = rangeHeader ? undefined : proxyCache.get(target);
  if (cached && cached.expires > Date.now()) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const url = new URL(target);
  const referer = refererForNetMirrorTarget(url);
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  headers.set('User-Agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36');
  headers.set('Referer', referer);
  headers.set('Accept', '*/*');

  // A 6-8 MB segment can take a while on the upstream CDN. Give each attempt a
  // fresh timeout (reusing an aborted AbortController makes every retry fail
  // instantly) and retry only transient failures.
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { controller, clear } = withTimeout(30000);
    try {
      upstream = await fetch(target, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      clear();
      if (upstream.ok || upstream.status === 206) break;
      if (upstream.status !== 429 && upstream.status < 500) break;
    } catch {
      clear();
      upstream = null;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!upstream) {
    console.error('NetMirror proxy could not reach upstream.', {
      host: url.hostname,
      path: url.pathname,
      region: process.env.VERCEL_REGION || 'local',
    });
    return new Response('Upstream source is unavailable.', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.error('NetMirror proxy upstream rejected the request.', {
      host: url.hostname,
      path: url.pathname,
      status: upstream.status,
      region: process.env.VERCEL_REGION || 'local',
    });
    return new Response('Upstream source is unavailable.', {
      status: upstream.status === 429 ? 429 : 502,
      headers: {
        'Cache-Control': 'no-store',
        'X-NetMirror-Upstream-Status': String(upstream.status),
      },
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  const isManifest = target.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8');
  // NetMirror disguises MPEG-TS fragments as .jpg (video) and .js (audio).
  const mediaPath = (() => {
    try { return new URL(target).pathname.toLowerCase(); } catch { return ''; }
  })();
  const isLegacySegment = url.hostname.endsWith('.top') && /\/files\/[a-z0-9._-]+\//i.test(url.pathname);
  const isTransportStream = isLegacySegment && /\.(jpg|jpeg|js|ts|woff2)$/.test(mediaPath) && !isManifest;
  const resolvedContentType = isTransportStream
    ? 'video/mp2t'
    : (contentType || 'application/octet-stream');

  // Handle synthetic video playlist generated from an audio playlist:
  // e.g. target has "?synthetic_video=720p" or query param synthetic_video
  const syntheticVideoRes = url.searchParams.get('synthetic_video');
  if (isManifest && syntheticVideoRes) {
    // Strip synthetic_video from upstream target
    const cleanUrl = new URL(target);
    cleanUrl.searchParams.delete('synthetic_video');
    const upstreamAudio = await fetch(cleanUrl.toString(), { headers, cache: 'no-store' }).catch(() => null);
    if (upstreamAudio && upstreamAudio.ok) {
      const audioText = await upstreamAudio.text();
      // Replace /a/<num>/ in path with /<res>/
      // e.g. https://makhi1.top/s22.freecdn4.top/files/tt33318732/a/0/0.m3u8
      // becomes https://makhi1.top/s22.freecdn4.top/files/tt33318732/720p/
      const cleanTargetStr = cleanUrl.toString();
      const videoBase = cleanTargetStr.replace(/\/a\/\d+\/.*$/, `/${syntheticVideoRes}/`);
      const vLines = audioText.split(/\r?\n/);
      const vRewritten: string[] = [];
      for (const line of vLines) {
        const trimmed = line.trim();
        if (trimmed.endsWith('.js')) {
          const woff2File = trimmed.replace(/\.js$/, '.woff2');
          const fullWoff2 = videoBase + woff2File;
          vRewritten.push(proxiedMediaPath(fullWoff2));
        } else {
          vRewritten.push(line);
        }
      }
      const vBody = vRewritten.join('\n');
      return new Response(vBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  if (isManifest) {
    const text = await upstream.text();
    const base = new URL(target);
    const invalidAudioGroups = new Set<string>();
    const lines = text.split(/\r?\n/);
    const rewritten: string[] = [];

    // Check if video streams use dummy placeholder 220884 and extract candidate audio track
    let firstRealAudioUri: string | null = null;
    for (const line of lines) {
      if (line.trim().startsWith('#EXT-X-MEDIA') && line.includes('TYPE=AUDIO')) {
        const match = line.match(/URI="([^"]+)"/);
        if (match) {
          try {
            const abs = new URL(match[1], base).toString();
            if (abs.includes('/files/') && !abs.includes('/files/220884/')) {
              firstRealAudioUri = abs;
              break;
            }
          } catch {}
        }
      }
    }

    let defaultAudioSet = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmed = line.trim();
      if (!trimmed) {
        rewritten.push(line);
        continue;
      }

      if (trimmed.startsWith('#EXT-X-MEDIA')) {
        const attributes = parseAttributeList(trimmed);
        const groupId = attributes['GROUP-ID'];
        const uri = attributes.URI;
        if (!uri) {
          rewritten.push(line);
          continue;
        }
        try {
          const absolute = new URL(uri, base).toString();
          if (!isAllowedNetMirrorTarget(absolute)) throw new Error('not allowed');
          let mediaLine = line.replace(/URI="[^"]*"/, `URI="${proxiedMediaPath(absolute)}"`);
          // Ensure at least the first audio track has DEFAULT=YES and AUTOSELECT=YES
          if (!defaultAudioSet && trimmed.includes('TYPE=AUDIO')) {
            defaultAudioSet = true;
            mediaLine = mediaLine.replace(/DEFAULT=NO/gi, 'DEFAULT=YES').replace(/AUTOSELECT=NO/gi, 'AUTOSELECT=YES');
          }
          rewritten.push(mediaLine);
        } catch {
          // A hostless URI such as https:///files/... cannot be proxied. Drop
          // the variant and remember the group so STREAM-INF stops asking for it.
          if (groupId) invalidAudioGroups.add(groupId);
        }
        continue;
      }

      if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
        let nextLine = line;
        for (const group of invalidAudioGroups) {
          nextLine = nextLine.replace(new RegExp(`,?AUDIO="${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi'), '');
        }
        rewritten.push(nextLine);
        continue;
      }

      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        try {
          const absolute = new URL(uriMatch[1], base).toString();
          if (isAllowedNetMirrorTarget(absolute)) {
            rewritten.push(line.replace(uriMatch[0], `URI="${proxiedMediaPath(absolute)}"`));
            continue;
          }
        } catch {
          // Keep original attribute if it cannot be resolved.
        }
        rewritten.push(line);
        continue;
      }

      if (trimmed.startsWith('#')) {
        rewritten.push(line);
        continue;
      }

      // Check if this stream URL is the dummy 220884 video track
      if (trimmed.includes('/files/220884/') && firstRealAudioUri) {
        // Extract resolution from trimmed URL or previous line
        const resMatch = trimmed.match(/(1080p|720p|480p|360p)/i) 
          || (lineIndex > 0 ? lines[lineIndex - 1].match(/RESOLUTION=\d+x(\d+)/i) : null);
        const res = resMatch ? (resMatch[1].endsWith('p') ? resMatch[1] : `${resMatch[1]}p`) : '720p';
        const synTarget = `${firstRealAudioUri}${firstRealAudioUri.includes('?') ? '&' : '?'}synthetic_video=${res}`;
        rewritten.push(proxiedMediaPath(synTarget));
        continue;
      }

      try {
        const absolute = new URL(trimmed, base).toString();
        if (isAllowedNetMirrorTarget(absolute)) {
          rewritten.push(proxiedMediaPath(absolute));
          continue;
        }
      } catch {
        // Keep original line if it is not a URL.
      }
      rewritten.push(line);
    }

    const body = rewritten.join('\n');
    if (proxyCache.size > 300) proxyCache.clear();
    proxyCache.set(target, {
      body: Buffer.from(body),
      contentType: 'application/vnd.apple.mpegurl',
      status: upstream.status,
      expires: Date.now() + 15 * 1000,
    });

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const isImage = /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(mediaPath) && !isTransportStream;
  const isSubtitle = /\.(vtt|srt)$/i.test(mediaPath);
  const cacheControl = isImage
    ? 'public, max-age=86400, stale-while-revalidate=604800'
    : isSubtitle
      ? 'public, max-age=86400'
      : 'public, max-age=300';

  const responseHeaders = new Headers({
    'Content-Type': resolvedContentType,
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
  });
  for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  // Cache small responses (images, audio fragments ~15-30 KB) so hls.js retries
  // and multiple viewers do not hammer the upstream CDN. Large video
  // fragments are streamed straight through.
  const contentLength = Number(upstream.headers.get('content-length') || 0);
  if (!rangeHeader && contentLength > 0 && (contentLength <= PROXY_CACHE_MAX_BYTES || isImage)) {
    const body = Buffer.from(await upstream.arrayBuffer());
    if (proxyCache.size > 500) proxyCache.clear();
    proxyCache.set(target, {
      body,
      contentType: resolvedContentType,
      status: upstream.status,
      expires: Date.now() + (isImage ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000),
    });
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
