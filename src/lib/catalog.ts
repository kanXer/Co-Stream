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

// Titles and IDs known to appear in catalogs but have no playable stream on NetMirror.
const NON_STREAMABLE_TMDB_IDS = new Set<number>([15226]); // C.I.D. (1998 TV Series)

export function isNonStreamableItem(item: { tmdbId?: number | string; title?: string }): boolean {
  if (item.tmdbId && NON_STREAMABLE_TMDB_IDS.has(Number(item.tmdbId))) return true;
  if (!item.title) return false;
  const t = item.title.trim().toLowerCase();
  const clean = t.replace(/[^a-z0-9]/g, '');
  if (clean === 'cid' || clean.startsWith('cid')) return true;
  if (/\b(c\.?\s*i\.?\s*d\.?)\b/i.test(t)) return true;
  if (/crime\s+investigation\s+department/i.test(t)) return true;
  return false;
}

/** Like uniqueCatalogItems but also excludes items explicitly marked as non-streamable or known unplayable. */
function streamableCatalogItems(items: NetMirrorCatalogItem[]) {
  return uniqueCatalogItems(items).filter(
    (item) => item.streamable !== false && !isNonStreamableItem(item),
  );
}

async function fillHindiAudioTitles(
  initial: NetMirrorCatalogItem[],
  candidates: NetMirrorCatalogItem[],
  type: 'movie' | 'tv',
  limit = 10,
) {
  const picked = streamableCatalogItems(initial).slice(0, limit);
  const seen = new Set(picked.map((item) => `${item.type}:${item.tmdbId}`));
  const remaining = streamableCatalogItems(candidates).filter((item) => !seen.has(`${item.type}:${item.tmdbId}`));

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
// with verified TMDB IDs and high-res poster artwork.
type HindiTitleDef = {
  tmdbId: number;
  title: string;
  year: string;
  poster?: string;
  rating?: number;
  overview?: string;
};

const HINDI_SPOTLIGHT_FALLBACK: HindiTitleDef[] = [
  { tmdbId: 1234139, title: 'Jailer 2',              year: '2026', poster: 'https://image.tmdb.org/t/p/w780/zpHTOdRl7GEPqFsDGqsN6Hi9Ylt.jpg', rating: 8.0, overview: 'The sequel to the blockbuster action thriller Jailer, starring Rajinikanth.' },
  { tmdbId: 1213243, title: 'Toxic',                  year: '2026', poster: 'https://image.tmdb.org/t/p/w780/5RTd3YCLWbEhbe9OXRuNX3pbT5U.jpg', rating: 8.0, overview: 'A fairy tale for grown-ups starring Yash, directed by Geetu Mohandas.' },
  { tmdbId: 1196943, title: 'Chhaava',                year: '2025', poster: 'https://image.tmdb.org/t/p/w185/ubRsrzb6NRW8YhVTJ6jG1kpNvCi.jpg', rating: 7.2, overview: 'Shivaji’s death sparks the Maratha-Mughal conflict as his son Sambhaji leads the resistance.' },
  { tmdbId: 1083241, title: 'Baby John',              year: '2024', poster: 'https://image.tmdb.org/t/p/w185/5Oqsh17dq0cIRFPynPNy5elmyxW.jpg', rating: 6.5, overview: 'An ex-cop living under an alias steps back into violence to protect his young daughter.' },
  { tmdbId: 1257960, title: 'Sikandar',               year: '2025', poster: 'https://image.tmdb.org/t/p/w185/41s42CRXafa3OuRGvCtfYPEBmse.jpg', rating: 6.5, overview: 'Salman Khan stars in this high-voltage action drama directed by AR Murugadoss.' },
  { tmdbId: 857598,  title: 'Pushpa 2 - The Rule',    year: '2024', poster: 'https://image.tmdb.org/t/p/w185/1T21FblunT0y8fz7YaW8JMYgUKm.jpg', rating: 6.8, overview: 'Pushpa Raj expands his empire while confronting old rivals and new adversaries.' },
  { tmdbId: 801688,  title: 'Kalki 2898-AD',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/rstcAnBeCkxNQjNp3YXrF6IP1tW.jpg', rating: 7.1, overview: 'A modern avatar of Vishnu descends to protect the world from evil forces in a dystopian future.' },
  { tmdbId: 1112426, title: 'Stree 2',                year: '2024', poster: 'https://image.tmdb.org/t/p/w185/nfnhwfUEFuSOxxf4jDdBlY6Lccw.jpg', rating: 7.3, overview: 'Chanderi is haunted once more, this time by a terrifying headless entity abducting women.' },
  { tmdbId: 1014214, title: 'Singham Again',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/2JbNkHg8m7LaBy61LyrnnlenaxY.jpg', rating: 6.2, overview: 'Bajirao Singham gathers his cop universe allies on a high-stakes rescue mission.' },
  { tmdbId: 980599,  title: 'Bhool Bhulaiyaa 3',      year: '2024', poster: 'https://image.tmdb.org/t/p/w185/3AfHD1HoaQpQwKH8kxRdBKVmzeU.jpg', rating: 6.0, overview: 'Rooh Baba ventures into a haunted mansion in Bengal, confronting two vengeful spirits.' },
  { tmdbId: 781732,  title: 'Animal',                 year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg', rating: 6.8, overview: 'A son’s obsessive love for his father triggers a brutal path of bloody vengeance.' },
  { tmdbId: 872906,  title: 'Jawan',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg', rating: 7.1, overview: 'A prison warden driven by personal vengeance recruits inmates to right societal wrongs.' },
  { tmdbId: 864692,  title: 'Pathaan',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/arf00BkwvXo0CFKbaD9OpqdE4Nu.jpg', rating: 6.6, overview: 'An exiled RAW field operative returns to stop a rogue mercenary group from destroying India.' },
  { tmdbId: 960876,  title: 'Dunki',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/kPRb1mbVHGop0egQ7153y0lhzGL.jpg', rating: 6.8, overview: 'Four friends from Punjab embark on a daring donkey flight journey to England.' },
  { tmdbId: 885331,  title: 'Gadar 2',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/brCBYKGQaxZZcwmFF6OIxZLdKVU.jpg', rating: 6.2, overview: 'Tara Singh crosses the border into Pakistan once again to rescue his captured son.' },
  { tmdbId: 720557,  title: 'Tiger 3',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/7wgED7Yx9VLcNWSO91VgwicHmMD.jpg', rating: 6.0, overview: 'Tiger and Zoya are framed as traitors and must race against time to save their country.' },
  { tmdbId: 1029827, title: 'Drishyam 2',             year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wk8Vu0DI0MiNLaXXiVqAwjLRKL5.jpg', rating: 8.1, overview: 'Seven years later, new revelations threaten to tear Vijay Salgaonkar’s family apart.' },
  { tmdbId: 1163258, title: '12th Fail',              year: '2023', poster: 'https://image.tmdb.org/t/p/w185/eebUPRI4Z5e1Z7Hev4JZAwMIFkX.jpg', rating: 8.3, overview: 'The inspiring real-life journey of IPS officer Manoj Kumar Sharma overcoming all odds.' },
  { tmdbId: 579974,  title: 'RRR',                    year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg', rating: 7.9, overview: 'A legendary tale of two revolutionaries fighting against British colonial rule in the 1920s.' },
  { tmdbId: 587412,  title: 'K.G.F: Chapter 2',       year: '2022', poster: 'https://image.tmdb.org/t/p/w185/khNVygolU0TxLIDWff5tQlAhZ23.jpg', rating: 7.7, overview: 'Rocky asserts his supremacy over KGF while dealing with adversaries and government forces.' },
  { tmdbId: 496331,  title: 'Brahmāstra Part One',    year: '2022', poster: 'https://image.tmdb.org/t/p/w185/x61qdvHIsr9U53FwoLVDQqAGur0.jpg', rating: 6.5, overview: 'Shiva discovers his extraordinary destiny and power over fire connected to the divine weapon.' },
  { tmdbId: 1109086, title: 'War 2',                  year: '2025', poster: 'https://image.tmdb.org/t/p/w780/pKIRUTnwY3YYU9urSdsuobdcliP.jpg', rating: 7.5, overview: 'Hrithik Roshan and Jr NTR clash in the sixth instalment of the YRF Spy Universe.' },
];

function hindiDefToCatalogItem(def: HindiTitleDef, type: 'movie' | 'tv' = 'movie'): NetMirrorCatalogItem {
  return {
    tmdbId: def.tmdbId,
    type,
    title: def.title,
    year: def.year,
    poster: def.poster,
    backdrop: def.poster,
    rating: def.rating || 7.0,
    overview: def.overview || 'Streaming in Hindi on Co-Stream.',
  };
}

const CURATED_HINDI_LATEST: HindiTitleDef[] = [
  { tmdbId: 1196943, title: 'Chhaava',                year: '2025', poster: 'https://image.tmdb.org/t/p/w185/ubRsrzb6NRW8YhVTJ6jG1kpNvCi.jpg', rating: 7.2 },
  { tmdbId: 1083241, title: 'Baby John',              year: '2024', poster: 'https://image.tmdb.org/t/p/w185/5Oqsh17dq0cIRFPynPNy5elmyxW.jpg', rating: 6.5 },
  { tmdbId: 1257960, title: 'Sikandar',               year: '2025', poster: 'https://image.tmdb.org/t/p/w185/41s42CRXafa3OuRGvCtfYPEBmse.jpg', rating: 6.5 },
  { tmdbId: 781732,  title: 'Animal',                 year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg', rating: 7.5 },
  { tmdbId: 872906,  title: 'Jawan',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg', rating: 7.6 },
  { tmdbId: 857598,  title: 'Pushpa 2 - The Rule',    year: '2024', poster: 'https://image.tmdb.org/t/p/w185/1T21FblunT0y8fz7YaW8JMYgUKm.jpg', rating: 6.8 },
  { tmdbId: 1112426, title: 'Stree 2',                year: '2024', poster: 'https://image.tmdb.org/t/p/w185/nfnhwfUEFuSOxxf4jDdBlY6Lccw.jpg', rating: 7.3 },
  { tmdbId: 801688,  title: 'Kalki 2898-AD',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/rstcAnBeCkxNQjNp3YXrF6IP1tW.jpg', rating: 7.1 },
  { tmdbId: 1014214, title: 'Singham Again',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/2JbNkHg8m7LaBy61LyrnnlenaxY.jpg', rating: 6.2 },
  { tmdbId: 980599,  title: 'Bhool Bhulaiyaa 3',      year: '2024', poster: 'https://image.tmdb.org/t/p/w185/3AfHD1HoaQpQwKH8kxRdBKVmzeU.jpg', rating: 6.0 },
  { tmdbId: 984101,  title: 'Bad Newz',               year: '2024', poster: 'https://image.tmdb.org/t/p/w185/qDlqxGATpYBWqGciPB4tmQm3bFT.jpg', rating: 5.5 },
  { tmdbId: 1233531, title: 'Article 370',            year: '2024', poster: 'https://image.tmdb.org/t/p/w185/9VTemjHMpyxzfC3JsG2aFy8Bf9Y.jpg', rating: 7.2 },
  { tmdbId: 1187058, title: 'Munjya',                 year: '2024', poster: 'https://image.tmdb.org/t/p/w185/ylYdXu0SM79Qs7vOz6q7mBxanVD.jpg', rating: 6.5 },
  { tmdbId: 1187619, title: 'Shaitaan',               year: '2024', poster: 'https://image.tmdb.org/t/p/w185/oRvFzcagAcC6Q317xtV7QXzwBnj.jpg', rating: 6.7 },
  { tmdbId: 850165,  title: 'Fighter',                year: '2024', poster: 'https://image.tmdb.org/t/p/w185/7MvqaSsnthX9xTDkDr3eZiftzp.jpg', rating: 6.8 },
  { tmdbId: 1146225, title: 'Chandu Champion',        year: '2024', poster: 'https://image.tmdb.org/t/p/w185/b21xN1TVcFeuEKdSGxEjGKfOYhE.jpg', rating: 7.3 },
  { tmdbId: 902897,  title: 'Yodha',                  year: '2024', poster: 'https://image.tmdb.org/t/p/w185/pnoOhdjceFu62dns1B1pfbdZOEy.jpg', rating: 6.1 },
  { tmdbId: 618355,  title: 'Maidaan',                year: '2024', poster: 'https://image.tmdb.org/t/p/w185/eKbAVKQf6choCfasNWuYoSTOPBP.jpg', rating: 7.4 },
  { tmdbId: 896350,  title: 'Merry Christmas',         year: '2024', poster: 'https://image.tmdb.org/t/p/w185/xzzny20uTtIit2VnxSdAFKcOFmU.jpg', rating: 7.0 },
  { tmdbId: 1072790, title: 'Teri Baaton Mein Aisa Uljha Jiya', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/yiOoPDxP0r5bb3YGBtHI5rBp1xS.jpg', rating: 6.2 },
];

const CURATED_HINDI_POPULAR: HindiTitleDef[] = [
  { tmdbId: 781732,  title: 'Animal',                 year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg', rating: 6.8 },
  { tmdbId: 872906,  title: 'Jawan',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg', rating: 7.1 },
  { tmdbId: 864692,  title: 'Pathaan',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/arf00BkwvXo0CFKbaD9OpqdE4Nu.jpg', rating: 6.6 },
  { tmdbId: 960876,  title: 'Dunki',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/kPRb1mbVHGop0egQ7153y0lhzGL.jpg', rating: 6.8 },
  { tmdbId: 1163258, title: '12th Fail',              year: '2023', poster: 'https://image.tmdb.org/t/p/w185/eebUPRI4Z5e1Z7Hev4JZAwMIFkX.jpg', rating: 8.3 },
  { tmdbId: 885331,  title: 'Gadar 2',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/brCBYKGQaxZZcwmFF6OIxZLdKVU.jpg', rating: 6.2 },
  { tmdbId: 720557,  title: 'Tiger 3',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/7wgED7Yx9VLcNWSO91VgwicHmMD.jpg', rating: 6.0 },
  { tmdbId: 1029827, title: 'Drishyam 2',             year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wk8Vu0DI0MiNLaXXiVqAwjLRKL5.jpg', rating: 8.1 },
  { tmdbId: 579974,  title: 'RRR',                    year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg', rating: 7.9 },
  { tmdbId: 587412,  title: 'K.G.F: Chapter 2',       year: '2022', poster: 'https://image.tmdb.org/t/p/w185/khNVygolU0TxLIDWff5tQlAhZ23.jpg', rating: 7.7 },
  { tmdbId: 496331,  title: 'Brahmāstra Part One: Shiva', year: '2022', poster: 'https://image.tmdb.org/t/p/w185/x61qdvHIsr9U53FwoLVDQqAGur0.jpg', rating: 6.5 },
  { tmdbId: 858485,  title: 'Kantara',                year: '2022', poster: 'https://image.tmdb.org/t/p/w185/jIsKmkxMzdCZ0Ux1GVSnu8m6Na6.jpg', rating: 7.4 },
  { tmdbId: 599925,  title: 'Shershaah',              year: '2021', poster: 'https://image.tmdb.org/t/p/w185/zGvFnwoXJKrYnKhoVPytqkqCJ8V.jpg', rating: 7.8 },
  { tmdbId: 632747,  title: 'Sooryavanshi',           year: '2021', poster: 'https://image.tmdb.org/t/p/w185/zgEc1Tn4iKvttPUzkMOUB4BNoXK.jpg', rating: 6.5 },
  { tmdbId: 580489,  title: 'Bhool Bhulaiyaa 2',      year: '2022', poster: 'https://image.tmdb.org/t/p/w185/fw0oMHiMt9qOuKEJEmzFiCNAnXc.jpg', rating: 6.3 },
  { tmdbId: 848116,  title: 'Rocky Aur Rani Kii Prem Kahaani', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/vTQIqlxUkOuyf2UKhlM2OUaFGKz.jpg', rating: 6.7 },
  { tmdbId: 799177,  title: 'Bhediya',                year: '2022', poster: 'https://image.tmdb.org/t/p/w185/iZtq44ZmxBW0E3tAeLG6UdJe9aj.jpg', rating: 6.8 },
  { tmdbId: 360814,  title: 'Dangal',                 year: '2016', poster: 'https://image.tmdb.org/t/p/w185/cJRPOLEexI7qp2DKtFfCh7YaaUG.jpg', rating: 8.1 },
  { tmdbId: 346648,  title: 'Bajrangi Bhaijaan',       year: '2015', poster: 'https://image.tmdb.org/t/p/w185/vhlliI7HZZlWfo5d6CiyfBAGLrW.jpg', rating: 7.9 },
  { tmdbId: 585268,  title: 'War',                    year: '2019', poster: 'https://image.tmdb.org/t/p/w185/yUtaHkL2SDIAZhRApZAyQrAXygn.jpg', rating: 6.9 },
];

const CURATED_HINDI_ACTION: HindiTitleDef[] = [
  { tmdbId: 872906,  title: 'Jawan',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg', rating: 7.1 },
  { tmdbId: 864692,  title: 'Pathaan',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/arf00BkwvXo0CFKbaD9OpqdE4Nu.jpg', rating: 6.6 },
  { tmdbId: 1014214, title: 'Singham Again',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/2JbNkHg8m7LaBy61LyrnnlenaxY.jpg', rating: 6.2 },
  { tmdbId: 720557,  title: 'Tiger 3',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/7wgED7Yx9VLcNWSO91VgwicHmMD.jpg', rating: 6.0 },
  { tmdbId: 857598,  title: 'Pushpa 2 - The Rule',    year: '2024', poster: 'https://image.tmdb.org/t/p/w185/1T21FblunT0y8fz7YaW8JMYgUKm.jpg', rating: 6.8 },
  { tmdbId: 801688,  title: 'Kalki 2898-AD',          year: '2024', poster: 'https://image.tmdb.org/t/p/w185/rstcAnBeCkxNQjNp3YXrF6IP1tW.jpg', rating: 7.1 },
  { tmdbId: 781732,  title: 'Animal',                 year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg', rating: 6.8 },
  { tmdbId: 885331,  title: 'Gadar 2',                year: '2023', poster: 'https://image.tmdb.org/t/p/w185/brCBYKGQaxZZcwmFF6OIxZLdKVU.jpg', rating: 6.2 },
  { tmdbId: 579974,  title: 'RRR',                    year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg', rating: 7.9 },
  { tmdbId: 587412,  title: 'K.G.F: Chapter 2',       year: '2022', poster: 'https://image.tmdb.org/t/p/w185/khNVygolU0TxLIDWff5tQlAhZ23.jpg', rating: 7.7 },
  { tmdbId: 1083241, title: 'Baby John',              year: '2024', poster: 'https://image.tmdb.org/t/p/w185/5Oqsh17dq0cIRFPynPNy5elmyxW.jpg', rating: 6.5 },
  { tmdbId: 1257960, title: 'Sikandar',               year: '2025', poster: 'https://image.tmdb.org/t/p/w185/41s42CRXafa3OuRGvCtfYPEBmse.jpg', rating: 6.5 },
  { tmdbId: 902897,  title: 'Yodha',                  year: '2024', poster: 'https://image.tmdb.org/t/p/w185/pnoOhdjceFu62dns1B1pfbdZOEy.jpg', rating: 6.1 },
  { tmdbId: 599925,  title: 'Shershaah',              year: '2021', poster: 'https://image.tmdb.org/t/p/w185/zGvFnwoXJKrYnKhoVPytqkqCJ8V.jpg', rating: 7.8 },
];

const CURATED_HINDI_COMEDY: HindiTitleDef[] = [
  { tmdbId: 1112426, title: 'Stree 2',                year: '2024', poster: 'https://image.tmdb.org/t/p/w185/nfnhwfUEFuSOxxf4jDdBlY6Lccw.jpg', rating: 7.3 },
  { tmdbId: 980599,  title: 'Bhool Bhulaiyaa 3',      year: '2024', poster: 'https://image.tmdb.org/t/p/w185/3AfHD1HoaQpQwKH8kxRdBKVmzeU.jpg', rating: 6.0 },
  { tmdbId: 984101,  title: 'Bad Newz',               year: '2024', poster: 'https://image.tmdb.org/t/p/w185/qDlqxGATpYBWqGciPB4tmQm3bFT.jpg', rating: 5.5 },
  { tmdbId: 1187058, title: 'Munjya',                 year: '2024', poster: 'https://image.tmdb.org/t/p/w185/ylYdXu0SM79Qs7vOz6q7mBxanVD.jpg', rating: 6.5 },
  { tmdbId: 960876,  title: 'Dunki',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/kPRb1mbVHGop0egQ7153y0lhzGL.jpg', rating: 6.8 },
  { tmdbId: 580489,  title: 'Bhool Bhulaiyaa 2',      year: '2022', poster: 'https://image.tmdb.org/t/p/w185/fw0oMHiMt9qOuKEJEmzFiCNAnXc.jpg', rating: 6.3 },
  { tmdbId: 848116,  title: 'Rocky Aur Rani Kii Prem Kahaani', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/vTQIqlxUkOuyf2UKhlM2OUaFGKz.jpg', rating: 6.7 },
  { tmdbId: 20453,   title: '3 Idiots',               year: '2009', poster: 'https://image.tmdb.org/t/p/w185/66A9MqXOyVFCssoloscw79z8Tew.jpg', rating: 8.4 },
  { tmdbId: 297222,  title: 'PK',                     year: '2014', poster: 'https://image.tmdb.org/t/p/w185/z2x2Y4tncefsIU7h82gmUM5vnBJ.jpg', rating: 7.7 },
  { tmdbId: 592834,  title: 'Chhichhore',             year: '2019', poster: 'https://image.tmdb.org/t/p/w185/56snL7jpuKS80WBSXJCg59XdvM3.jpg', rating: 7.5 },
];

const CURATED_HINDI_THRILLER: HindiTitleDef[] = [
  { tmdbId: 1029827, title: 'Drishyam 2',             year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wk8Vu0DI0MiNLaXXiVqAwjLRKL5.jpg', rating: 8.1 },
  { tmdbId: 1187619, title: 'Shaitaan',               year: '2024', poster: 'https://image.tmdb.org/t/p/w185/oRvFzcagAcC6Q317xtV7QXzwBnj.jpg', rating: 6.7 },
  { tmdbId: 1233531, title: 'Article 370',            year: '2024', poster: 'https://image.tmdb.org/t/p/w185/9VTemjHMpyxzfC3JsG2aFy8Bf9Y.jpg', rating: 7.2 },
  { tmdbId: 896350,  title: 'Merry Christmas',         year: '2024', poster: 'https://image.tmdb.org/t/p/w185/xzzny20uTtIit2VnxSdAFKcOFmU.jpg', rating: 7.0 },
  { tmdbId: 748783,  title: 'The Kashmir Files',      year: '2022', poster: 'https://image.tmdb.org/t/p/w185/2VvjJFDBFYkVgr89BjqbUl26QyW.jpg', rating: 7.2 },
  { tmdbId: 534780,  title: 'Andhadhun',              year: '2018', poster: 'https://image.tmdb.org/t/p/w185/dy3K6hNvwE05siGgiLJcEiwgpdO.jpg', rating: 8.2 },
  { tmdbId: 559907,  title: 'Badla',                  year: '2019', poster: 'https://image.tmdb.org/t/p/w185/cl8qaliwax7BvJg1AnxIca832F7.jpg', rating: 7.1 },
  { tmdbId: 341012,  title: 'Drishyam',               year: '2015', poster: 'https://image.tmdb.org/t/p/w185/gIClWRv5OSe8rl5Koi0AeUcCZ9Z.jpg', rating: 8.3 },
  { tmdbId: 509967,  title: 'Raazi',                  year: '2018', poster: 'https://image.tmdb.org/t/p/w185/l9VJoRj0CYBURsnetvazq73FOfz.jpg', rating: 7.7 },
];

const CURATED_HINDI_SERIES_LIST: HindiTitleDef[] = [
  { tmdbId: 79141,   title: 'Sacred Games',           year: '2018', poster: 'https://image.tmdb.org/t/p/w185/uEbNtFbK4At9WBDGap23lt1qO9n.jpg', rating: 8.1 },
  { tmdbId: 84661,   title: 'Mirzapur',               year: '2018', poster: 'https://image.tmdb.org/t/p/w185/p0qM8hhlMF5DuxHBzl2EZR6TehX.jpg', rating: 8.4 },
  { tmdbId: 93405,   title: 'The Family Man',         year: '2019', poster: 'https://image.tmdb.org/t/p/w185/9wToOVsKuf0XeKhlauzCa3D8Gui.jpg', rating: 8.6 },
  { tmdbId: 101344,  title: 'Panchayat',              year: '2020', poster: 'https://image.tmdb.org/t/p/w185/8ivTX5q2otqXvH815BcOhxVkTPW.jpg', rating: 8.7 },
  { tmdbId: 103222,  title: 'Paatal Lok',             year: '2020', poster: 'https://image.tmdb.org/t/p/w185/8Hcq3HoJE4shH7BWkp9UNSFCE3O.jpg', rating: 8.0 },
  { tmdbId: 200843,  title: 'Farzi',                  year: '2023', poster: 'https://image.tmdb.org/t/p/w185/cTS86RwEBIDgCgUmjWQTSoPsK6p.jpg', rating: 8.2 },
  { tmdbId: 88040,   title: 'Delhi Crime',            year: '2019', poster: 'https://image.tmdb.org/t/p/w185/xkpkTj6KGsjSaet0VQaq0aTn31D.jpg', rating: 8.4 },
  { tmdbId: 88584,   title: 'Kota Factory',           year: '2019', poster: 'https://image.tmdb.org/t/p/w185/fMBookmwL6HjIgIVTjQ6EMr3pCH.jpg', rating: 8.5 },
  { tmdbId: 112888,  title: 'Mismatched',             year: '2020', poster: 'https://image.tmdb.org/t/p/w185/l65kfL6qhTWd858OqGTr3RWwAUj.jpg', rating: 7.2 },
  { tmdbId: 133701,  title: 'Rana Naidu',             year: '2023', poster: 'https://image.tmdb.org/t/p/w185/4kUF7cO76W4vEx70KVfwmju6Vud.jpg', rating: 6.5 },
  { tmdbId: 97893,   title: 'Jamtara – Sabka Number Ayega', year: '2020', poster: 'https://image.tmdb.org/t/p/w185/wqWsyazYqBceNMyRIg9q8HSJEcw.jpg', rating: 7.6 },
  { tmdbId: 238310,  title: 'The Railway Men',        year: '2023', poster: 'https://image.tmdb.org/t/p/w185/kOYlMHtNSqnf1FgsoK1JJypfkrY.jpg', rating: 8.1 },
  { tmdbId: 247169,  title: 'Maamla Legal Hai',       year: '2024', poster: 'https://image.tmdb.org/t/p/w185/tDP5vC5wxSpHKx88RdyRpdaSo2u.jpg', rating: 7.5 },
  { tmdbId: 99966,   title: 'Asur',                   year: '2020', poster: 'https://image.tmdb.org/t/p/w185/hJn71rU1VXNJpAMiWwvSxxaFU00.jpg', rating: 8.4 },
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

  // Parallel: home rails (for trending rail) + curated platforms
  const [homeResult, netflixCurated, primeCurated] = await Promise.allSettled([
    getCurrentNetMirrorHome(),
    getCurrentNetMirrorCurated('Netflix'),
    getCurrentNetMirrorCurated('PrimeVideo'),
  ]);

  const homeRails = homeResult.status === 'fulfilled' ? homeResult.value : [];
  const nCurated = netflixCurated.status === 'fulfilled' ? netflixCurated.value : [];
  const pCurated = primeCurated.status === 'fulfilled' ? primeCurated.value : [];

  // Extract "trending / new release / bollywood / hindi / indian" rails from live feeds
  const hindiRailItems = [...homeRails, ...nCurated, ...pCurated]
    .filter((rail) => /trending|new release|bollywood|hindi|indian/i.test(rail.title))
    .flatMap((rail) => rail.items)
    .filter((item) => item.type === 'movie' && !isNonStreamableItem(item));

  // Merge candidates with top priority given to big Bollywood blockbusters
  const seen = new Set<string>();
  const merged: NetMirrorCatalogItem[] = [];

  const addDef = (def: HindiTitleDef) => {
    const key = `movie:${def.tmdbId}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(hindiDefToCatalogItem(def, 'movie'));
  };

  const addItem = (item: NetMirrorCatalogItem) => {
    const key = `${item.type}:${item.tmdbId || item.subjectId}`;
    if (seen.has(key)) return;
    if (isNonStreamableItem(item)) return;
    seen.add(key);
    merged.push(item);
  };

  // 1. Curated Hindi spotlight blockbusters first (Jailer 2, Toxic, Chhaava, Baby John, Sikandar, Pushpa 2, etc.)
  for (const def of HINDI_SPOTLIGHT_FALLBACK) {
    addDef(def);
  }

  // 2. Add genuine items from live Hindi rails
  for (const item of hindiRailItems) {
    addItem(item);
  }

  const items = merged.slice(0, 8).map(mapSpotlightItem);

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

  const [curatedResult, seriesResult] = await Promise.allSettled([
    getCurrentNetMirrorCurated(platform),
    discoverCurrentNetMirror({ type: 'tv', region, platform, country: 'IN', sort: 'popularity' }),
  ]);
  const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
  const platformSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];
  const hindiMovieRails = curated.filter((rail) => /hindi|bollywood|indian/i.test(rail.title));
  const curatedMovies = streamableCatalogItems(hindiMovieRails.flatMap((rail) => rail.items).filter((item) => item.type === 'movie'));

  // Fill platform movies with real Hindi titles
  const platformMoviePool: NetMirrorCatalogItem[] = [...curatedMovies];
  if (platform === 'Netflix') {
    const netflixHindiTitles: HindiTitleDef[] = [
      { tmdbId: 1112426, title: 'Stree 2', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/nfnhwfUEFuSOxxf4jDdBlY6Lccw.jpg' },
      { tmdbId: 1014214, title: 'Singham Again', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/2JbNkHg8m7LaBy61LyrnnlenaxY.jpg' },
      { tmdbId: 984101,  title: 'Bad Newz', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/qDlqxGATpYBWqGciPB4tmQm3bFT.jpg' },
      { tmdbId: 1233531, title: 'Article 370', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/9VTemjHMpyxzfC3JsG2aFy8Bf9Y.jpg' },
      { tmdbId: 872906,  title: 'Jawan', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg' },
      { tmdbId: 960876,  title: 'Dunki', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/kPRb1mbVHGop0egQ7153y0lhzGL.jpg' },
      { tmdbId: 781732,  title: 'Animal', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg' },
      { tmdbId: 1163258, title: '12th Fail', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/eebUPRI4Z5e1Z7Hev4JZAwMIFkX.jpg' },
      { tmdbId: 580489,  title: 'Bhool Bhulaiyaa 2', year: '2022', poster: 'https://image.tmdb.org/t/p/w185/fw0oMHiMt9qOuKEJEmzFiCNAnXc.jpg' },
    ];
    for (const def of netflixHindiTitles) {
      if (!platformMoviePool.some((m) => m.tmdbId === def.tmdbId)) {
        platformMoviePool.push(hindiDefToCatalogItem(def, 'movie'));
      }
    }
  } else if (platform === 'PrimeVideo') {
    const primeHindiTitles: HindiTitleDef[] = [
      { tmdbId: 801688,  title: 'Kalki 2898-AD', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/rstcAnBeCkxNQjNp3YXrF6IP1tW.jpg' },
      { tmdbId: 857598,  title: 'Pushpa 2 - The Rule', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/1T21FblunT0y8fz7YaW8JMYgUKm.jpg' },
      { tmdbId: 1112426, title: 'Stree 2', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/nfnhwfUEFuSOxxf4jDdBlY6Lccw.jpg' },
      { tmdbId: 1014214, title: 'Singham Again', year: '2024', poster: 'https://image.tmdb.org/t/p/w185/2JbNkHg8m7LaBy61LyrnnlenaxY.jpg' },
      { tmdbId: 781732,  title: 'Animal', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/hr9rjR3J0xBBKmlJ4n3gHId9ccx.jpg' },
      { tmdbId: 872906,  title: 'Jawan', year: '2023', poster: 'https://image.tmdb.org/t/p/w185/jFt1gS4BGHlK8xt76Y81Alp4dbt.jpg' },
      { tmdbId: 579974,  title: 'RRR', year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg' },
      { tmdbId: 587412,  title: 'K.G.F: Chapter 2', year: '2022', poster: 'https://image.tmdb.org/t/p/w185/khNVygolU0TxLIDWff5tQlAhZ23.jpg' },
      { tmdbId: 1029827, title: 'Drishyam 2', year: '2022', poster: 'https://image.tmdb.org/t/p/w185/wk8Vu0DI0MiNLaXXiVqAwjLRKL5.jpg' },
    ];
    for (const def of primeHindiTitles) {
      if (!platformMoviePool.some((m) => m.tmdbId === def.tmdbId)) {
        platformMoviePool.push(hindiDefToCatalogItem(def, 'movie'));
      }
    }
  }

  // Combine live series from NetMirror with curated series pool, strictly excluding CID
  const seriesPool: NetMirrorCatalogItem[] = [...streamableCatalogItems(platformSeries)];
  for (const def of CURATED_HINDI_SERIES_LIST) {
    if (!seriesPool.some((s) => s.tmdbId === def.tmdbId)) {
      seriesPool.push(hindiDefToCatalogItem(def, 'tv'));
    }
  }

  const movies = streamableCatalogItems(platformMoviePool).slice(0, 10);
  const series = streamableCatalogItems(seriesPool).slice(0, 10);
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
      const currentYear = new Date().getUTCFullYear();

      // Massive parallel fetch for home — all Hindi/Indian focused
      const [
        platformRowsResult,
        spotlightResult,
        latestHindiMoviesResult,
        latestHindiSeriesResult,
        popularHindiMoviesResult,
        popularHindiSeriesResult,
        topRatedMoviesResult,
        topRatedSeriesResult,
        thisYearMoviesResult,
        actionMoviesResult,
        thrillerMoviesResult,
        romanceMoviesResult,
        actionSeriesResult,
        crimeSeriesResult,
        horrorResult,
        scifiResult,
        comedyMoviesResult,
        familyMoviesResult,
      ] = await Promise.allSettled([
        Promise.all(platforms.map(async (platform) => ({
          platform,
          ...(await getPlatformHindiRows(platform, region)),
        }))),
        getSpotlightMovies(region),
        // Latest Hindi movies (current + prev year by release)
        discoverCurrentNetMirror({ type: 'movie', region: 'IN', country: 'IN', sort: 'release', yearFrom: currentYear - 1, yearTo: currentYear + 1 }),
        // Latest Hindi series
        discoverCurrentNetMirror({ type: 'tv', region: 'IN', country: 'IN', sort: 'release', yearFrom: currentYear - 1, yearTo: currentYear + 1 }),
        // Most popular Hindi movies all time
        discoverCurrentNetMirror({ type: 'movie', region: 'IN', country: 'IN', sort: 'popularity' }),
        // Most popular Hindi series
        discoverCurrentNetMirror({ type: 'tv', region: 'IN', country: 'IN', sort: 'popularity' }),
        // Top rated movies
        discoverCurrentNetMirror({ type: 'movie', region: 'IN', sort: 'rating', yearFrom: currentYear - 2, yearTo: currentYear + 1 }),
        // Top rated series
        discoverCurrentNetMirror({ type: 'tv', region: 'IN', sort: 'rating', yearFrom: currentYear - 2, yearTo: currentYear + 1 }),
        // This year's movies
        discoverCurrentNetMirror({ type: 'movie', region: 'IN', sort: 'release', yearFrom: currentYear, yearTo: currentYear + 1 }),
        // Action movies
        searchCurrentNetMirror('Hindi action movie').then((r) => r.filter((i) => i.type === 'movie')),
        // Thriller movies
        searchCurrentNetMirror('Hindi thriller movie').then((r) => r.filter((i) => i.type === 'movie')),
        // Romance movies
        searchCurrentNetMirror('Hindi romance movie').then((r) => r.filter((i) => i.type === 'movie')),
        // Action series
        searchCurrentNetMirror('Hindi action web series').then((r) => r.filter((i) => i.type === 'tv')),
        // Crime series
        searchCurrentNetMirror('Hindi crime web series').then((r) => r.filter((i) => i.type === 'tv')),
        // Horror
        searchCurrentNetMirror('Hindi horror').then((r) => r),
        // Sci-fi
        searchCurrentNetMirror('Hindi sci-fi fantasy movie').then((r) => r.filter((i) => i.type === 'movie')),
        // Comedy movies
        searchCurrentNetMirror('Hindi comedy movie').then((r) => r.filter((i) => i.type === 'movie')),
        // Family
        searchCurrentNetMirror('Hindi family movie').then((r) => r.filter((i) => i.type === 'movie')),
      ]);

      const spotlight = spotlightResult.status === 'fulfilled' ? spotlightResult.value : [];
      const platformRows = platformRowsResult.status === 'fulfilled' ? platformRowsResult.value : [];

      const val = <T>(r: PromiseSettledResult<T[]>): T[] => r.status === 'fulfilled' ? r.value : [];

      const sections: HomeSection[] = [];

      // Merge live results with verified curated Hindi pools so no section is ever empty or filled with Hollywood
      const buildSectionItems = (curatedDefs: HindiTitleDef[], liveItems: NetMirrorCatalogItem[], limit = 20, type: 'movie' | 'tv' = 'movie') => {
        const seenIds = new Set<string>();
        const res: NetMirrorCatalogItem[] = [];
        // First add curated authentic Hindi titles
        for (const def of curatedDefs) {
          const key = `${type}:${def.tmdbId}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            res.push(hindiDefToCatalogItem(def, type));
          }
        }
        // Then add live items if streamable and not seen
        for (const item of streamableCatalogItems(liveItems)) {
          const key = `${item.type}:${item.tmdbId || item.subjectId}`;
          if (!seenIds.has(key) && !isNonStreamableItem(item)) {
            seenIds.add(key);
            res.push(item);
          }
        }
        return res.slice(0, limit);
      };

      // ── 1. Latest Hindi Movies (top priority) ─────────────────────────
      const latestHindi = buildSectionItems(CURATED_HINDI_LATEST, val(latestHindiMoviesResult), 20);
      if (latestHindi.length) {
        sections.push({
          id: 'latest-hindi-movies',
          title: '🆕 Latest Hindi Movies',
          subtitle: 'Newest Bollywood & Indian releases',
          items: latestHindi.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 2. This Year's Releases ────────────────────────────────────────
      const thisYear = buildSectionItems(
        CURATED_HINDI_LATEST.filter((x) => Number(x.year) >= currentYear - 1),
        val(thisYearMoviesResult),
        15,
      );
      if (thisYear.length) {
        sections.push({
          id: `hindi-movies-${currentYear}`,
          title: `🎬 ${currentYear} Bollywood Hits`,
          subtitle: `Top Indian movies releasing in ${currentYear}`,
          items: thisYear.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 3. Platform Top 10s (movies first, then series) ───────────────
      for (const { platform, movies, series } of platformRows) {
        const mItems = streamableCatalogItems(movies);
        if (mItems.length) {
          sections.push({
            id: `top10-hindi-${platform}-movie`,
            title: `🏆 Top 10 Hindi Movies on ${platformLabel(platform)}`,
            subtitle: 'Trending movies with Hindi audio',
            items: mItems.map((i) => mapCurrentItem(i)),
          });
        }
        const sItems = streamableCatalogItems(series);
        if (sItems.length) {
          sections.push({
            id: `top10-hindi-${platform}-tv`,
            title: `📺 Top 10 Hindi Web Series on ${platformLabel(platform)}`,
            subtitle: 'Trending Indian and Hindi series',
            items: sItems.map((i) => mapCurrentItem(i)),
          });
        }
      }

      // ── 4. Most Popular Hindi Movies ──────────────────────────────────
      const popularMovies = buildSectionItems(CURATED_HINDI_POPULAR, val(popularHindiMoviesResult), 20);
      if (popularMovies.length) {
        sections.push({
          id: 'popular-hindi-movies',
          title: '🔥 Most Popular Hindi Movies',
          subtitle: 'All-time Bollywood fan favourites',
          items: popularMovies.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 5. Top Rated Movies ───────────────────────────────────────────
      const topMovies = buildSectionItems(
        CURATED_HINDI_POPULAR.filter((x) => (x.rating || 0) >= 7.0),
        val(topRatedMoviesResult),
        15,
      );
      if (topMovies.length) {
        sections.push({
          id: 'top-rated-hindi-movies',
          title: '⭐ Top Rated Hindi Movies',
          subtitle: 'Highest rated Indian films',
          items: topMovies.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 6. Latest Hindi Web Series ────────────────────────────────────
      const latestSeries = buildSectionItems(
        CURATED_HINDI_SERIES_LIST,
        val(latestHindiSeriesResult),
        15,
        'tv',
      );
      if (latestSeries.length) {
        sections.push({
          id: 'latest-hindi-series',
          title: '🆕 Latest Hindi Web Series',
          subtitle: 'Freshest Indian streaming shows',
          items: latestSeries.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 7. Popular Hindi Web Series ───────────────────────────────────
      const popularSeries = buildSectionItems(
        CURATED_HINDI_SERIES_LIST,
        val(popularHindiSeriesResult),
        15,
        'tv',
      );
      if (popularSeries.length) {
        sections.push({
          id: 'popular-hindi-series',
          title: '🔥 Most Popular Hindi Web Series',
          subtitle: 'Binge-worthy Indian shows',
          items: popularSeries.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 8. Top Rated Web Series ───────────────────────────────────────
      const topSeries = buildSectionItems(
        CURATED_HINDI_SERIES_LIST.filter((x) => (x.rating || 0) >= 8.0),
        val(topRatedSeriesResult),
        15,
        'tv',
      );
      if (topSeries.length) {
        sections.push({
          id: 'top-rated-hindi-series',
          title: '⭐ Top Rated Hindi Web Series',
          subtitle: 'Critically acclaimed Indian shows',
          items: topSeries.map((i) => mapCurrentItem(i)),
        });
      }

      // ── 9–18. Genre Sections ─────────────────────────────────────────
      const genreData: Array<{ id: string; title: string; subtitle: string; curated: HindiTitleDef[]; live: NetMirrorCatalogItem[]; type?: 'movie' | 'tv' }> = [
        { id: 'hindi-action-movies',   title: '💥 Hindi Action Movies',       subtitle: 'High-octane Bollywood action',        curated: CURATED_HINDI_ACTION, live: val(actionMoviesResult) },
        { id: 'hindi-thriller-movies', title: '🔪 Hindi Thrillers',            subtitle: 'Edge-of-your-seat suspense films',     curated: CURATED_HINDI_THRILLER, live: val(thrillerMoviesResult) },
        { id: 'hindi-comedy-movies',   title: '😂 Hindi Comedy Movies',        subtitle: 'Laugh-out-loud Bollywood picks',       curated: CURATED_HINDI_COMEDY, live: val(comedyMoviesResult) },
        { id: 'hindi-romance-movies',  title: '💕 Hindi Romance & Drama',      subtitle: 'Heartfelt Bollywood love stories',     curated: CURATED_HINDI_POPULAR.filter((x) => [848116, 1163258, 1146225, 618355, 346648, 960876].includes(x.tmdbId)), live: val(romanceMoviesResult) },
        { id: 'hindi-horror',          title: '👻 Hindi Horror & Mystery',     subtitle: 'Spine-chilling desi supernatural',     curated: CURATED_HINDI_LATEST.filter((x) => [1112426, 980599, 1187058, 1187619].includes(x.tmdbId)), live: val(horrorResult) },
        { id: 'hindi-action-series',   title: '💥 Hindi Action Web Series',    subtitle: 'Action-packed Indian shows',           curated: CURATED_HINDI_SERIES_LIST.filter((x) => [79141, 84661, 93405, 103222, 200843, 99966].includes(x.tmdbId)), live: val(actionSeriesResult), type: 'tv' },
        { id: 'hindi-crime-series',    title: '🕵️ Hindi Crime Web Series',     subtitle: 'Crime dramas & gritty investigations', curated: CURATED_HINDI_SERIES_LIST.filter((x) => [88040, 97893, 238310, 247169, 103222].includes(x.tmdbId)), live: val(crimeSeriesResult), type: 'tv' },
        { id: 'hindi-scifi-movies',    title: '🚀 Hindi Sci-Fi & Fantasy',     subtitle: 'Futuristic Indian blockbusters',       curated: CURATED_HINDI_LATEST.filter((x) => [801688, 496331, 799177].includes(x.tmdbId)), live: val(scifiResult) },
      ];

      for (const g of genreData) {
        const items = buildSectionItems(g.curated, g.live, 15, g.type || 'movie');
        if (items.length > 0) {
          sections.push({
            id: g.id,
            title: g.title,
            subtitle: g.subtitle,
            items: items.map((i) => mapCurrentItem(i)),
          });
        }
      }

      const payload: CatalogPayload = {
        mode: 'netmirror',
        sections: sections.filter((s) => s.items.length > 0),
        spotlight,
      };
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

    // Prioritise Indian & Hindi content at the top of Movies and Series tabs
    if (mediaType === 'movie') {
      sections.push({
        id: 'top-hindi-movies-tab',
        title: '🆕 Latest Hindi & Bollywood Movies',
        subtitle: 'Newest Indian blockbuster releases',
        items: CURATED_HINDI_LATEST.map((def) => mapCurrentItem(hindiDefToCatalogItem(def, 'movie'))),
      });
      sections.push({
        id: 'popular-hindi-movies-tab',
        title: '🔥 All-Time Popular Bollywood Cinema',
        subtitle: 'Audience favourites & iconic blockbusters',
        items: CURATED_HINDI_POPULAR.map((def) => mapCurrentItem(hindiDefToCatalogItem(def, 'movie'))),
      });
    } else {
      sections.push({
        id: 'top-hindi-series-tab',
        title: '📺 Top Indian Web Series',
        subtitle: 'Critically acclaimed Indian streaming shows',
        items: CURATED_HINDI_SERIES_LIST.map((def) => mapCurrentItem(hindiDefToCatalogItem(def, 'tv'))),
      });
    }

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
      .filter((item) => !isNonStreamableItem(item))
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
      related: await getRelatedMedia(type, id),
    };
  } catch (error) {
    console.error('NetMirror details failed:', error);
    return null;
  }
}

export async function getRelatedMedia(type: MediaType, id: string): Promise<MediaItem[]> {
  const currentTmdb = Number(id.match(/\d+/)?.[0]) || 0;
  const sourceList = type === 'tv'
    ? CURATED_HINDI_SERIES_LIST
    : [...CURATED_HINDI_LATEST, ...CURATED_HINDI_POPULAR, ...CURATED_HINDI_ACTION, ...CURATED_HINDI_THRILLER, ...CURATED_HINDI_COMEDY];

  const seen = new Set<number>();
  if (currentTmdb) seen.add(currentTmdb);

  const related: MediaItem[] = [];
  for (const def of sourceList) {
    if (seen.has(def.tmdbId)) continue;
    seen.add(def.tmdbId);
    related.push(mapCurrentItem(hindiDefToCatalogItem(def, type)));
    if (related.length >= 10) break;
  }
  return related;
}
