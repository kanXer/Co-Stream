'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  MediaItem,
  RepeatMode,
  ThemeMode,
  UserCollection,
  WatchProgress,
} from '@/types';

export const AVAILABLE_REGIONS = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
];

export const AVAILABLE_LANGUAGES = [
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'es', name: 'Spanish', native: 'Español' },
];

export interface PlaybackController {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  syncWithTime?: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

interface StreamContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
  selectedRegion: string;
  setSelectedRegion: (region: string) => void;
  selectedLanguages: string[];
  setSelectedLanguages: (languages: string[]) => void;
  isOnline: boolean;

  currentItem: MediaItem | null;
  queue: MediaItem[];
  queueIndex: number;
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
  isPlaying: boolean;
  isLoading: boolean;
  playbackError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  playItem: (item: MediaItem, queue?: MediaItem[], shuffleFirst?: boolean) => void;
  closePlayer: () => void;
  replaceQueue: (items: MediaItem[], currentItemId?: string) => void;
  resolveCurrentItem: (item: MediaItem) => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  syncWithTime: (seconds: number) => void;
  nextItem: () => void;
  previousItem: () => void;
  handleEnded: () => void;
  setVolume: (value: number) => void;
  cycleRepeatMode: () => void;
  toggleShuffle: () => void;
  registerController: (controller: PlaybackController | null) => void;
  reportPlayback: (state: Partial<{
    isPlaying: boolean;
    isLoading: boolean;
    error: string | null;
    currentTime: number;
    duration: number;
    forceTimeUpdate?: boolean;
  }>) => void;

  watchlist: MediaItem[];
  toggleWatchlist: (item: MediaItem) => void;
  isWatchlisted: (id: string) => boolean;
  recentItems: MediaItem[];
  collections: UserCollection[];
  createCollection: (title: string) => UserCollection | null;
  deleteCollection: (id: string) => void;
  addToCollection: (collectionId: string, item: MediaItem) => void;
  removeFromCollection: (collectionId: string, itemId: string) => void;
  watchProgress: Record<string, WatchProgress>;
  updateWatchProgress: (itemId: string, position: number, total: number, force?: boolean) => void;
  searchHistory: string[];
  addSearchHistory: (term: string) => void;
  removeSearchHistory: (term: string) => void;
  clearSearchHistory: () => void;

  sleepTimerMinutes: number | null;
  sleepRemainingSeconds: number;
  setSleepTimer: (minutes: number | null) => void;
}

const StreamContext = createContext<StreamContextValue | null>(null);

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Storage may be unavailable in private mode; the live session still works.
  }
}

function shuffled<T>(input: T[]) {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapWith]] = [output[swapWith], output[index]];
  }
  return output;
}

export function extractCleanSeriesTitle(title: string): string {
  return title.replace(/\s*•\s*S\d+\s*E\d+.*$/i, '').trim();
}

export function journeyKey(item: {
  id?: string;
  providerId?: string;
  catalogId?: number;
  title?: string;
  mediaType?: string;
}): string {
  const isTv = item.mediaType === 'tv';

  if (item.catalogId) {
    return `${isTv ? 'tv' : 'movie'}:${item.catalogId}`;
  }

  const combined = `${item.providerId || ''} ${item.id || ''}`;
  const tmdbMatch = combined.match(/(?:tmdb:)?(?:movie|tv)?:?(\d+)/i);
  if (tmdbMatch) {
    return `${isTv ? 'tv' : 'movie'}:${tmdbMatch[1]}`;
  }

  const cleanTitle = extractCleanSeriesTitle(item.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (cleanTitle) {
    return `${isTv ? 'tv' : 'movie'}:${cleanTitle}`;
  }

  const raw = (item.providerId || item.id || '')
    .replace(/^netmirror-/i, '')
    .replace(/-s\d+e\d+$/i, '')
    .toLowerCase()
    .trim();
  return `${isTv ? 'tv' : 'movie'}:${raw}`;
}

function normalizeRecentItem(item: MediaItem): MediaItem {
  const genres = Array.isArray(item.genres) ? item.genres : [];
  if (item.mediaType === 'tv') {
    const cleanTitle = extractCleanSeriesTitle(item.title);
    return {
      ...item,
      title: cleanTitle || item.title,
      genres,
      selectedSeason: item.selectedSeason || 1,
      selectedEpisode: item.selectedEpisode || 1,
    };
  }
  return { ...item, genres };
}

function compactRecentItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const raw of items) {
    const key = journeyKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalizeRecentItem(raw));
    if (result.length >= 60) break;
  }
  return result;
}

function putRecentItem(items: MediaItem[], item: MediaItem): MediaItem[] {
  const key = journeyKey(item);
  const normalized = normalizeRecentItem(item);
  const filtered = items.filter((entry) => journeyKey(entry) !== key);
  return [normalized, ...filtered].slice(0, 60);
}

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('SYSTEM');
  const [selectedRegion, setSelectedRegionState] = useState('IN');
  const [selectedLanguages, setSelectedLanguagesState] = useState<string[]>(['hi', 'en']);
  const [isOnline, setIsOnline] = useState(true);

  const [currentItem, setCurrentItem] = useState<MediaItem | null>(null);
  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('OFF');
  const [shuffle, setShuffle] = useState(false);

  const [watchlist, setWatchlist] = useState<MediaItem[]>([]);
  const [recentItems, setRecentItems] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgress>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState(0);

  const controllerRef = useRef<PlaybackController | null>(null);
  const queueRef = useRef<MediaItem[]>([]);
  const queueIndexRef = useRef(0);
  const currentRef = useRef<MediaItem | null>(null);
  const repeatRef = useRef<RepeatMode>('OFF');
  const currentTimeRef = useRef(0);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressSaveRef = useRef(0);

  useEffect(() => {
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    currentRef.current = currentItem;
    repeatRef.current = repeatMode;
    currentTimeRef.current = currentTime;
  }, [queue, queueIndex, currentItem, repeatMode, currentTime]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('co_theme') as ThemeMode | null;
    if (savedTheme === 'DARK' || savedTheme === 'LIGHT' || savedTheme === 'SYSTEM') {
      setThemeModeState(savedTheme);
    }
    setSelectedRegionState(localStorage.getItem('co_region') || 'IN');
    setSelectedLanguagesState(loadJson('co_languages', ['hi', 'en']));
    setWatchlist(loadJson('co_watchlist', []));
    const savedRecentItems = compactRecentItems(loadJson<MediaItem[]>('co_recent', []));
    setRecentItems(savedRecentItems);
    saveJson('co_recent', savedRecentItems);
    setCollections(loadJson('co_collections', []));
    setWatchProgress(loadJson('co_progress', {}));
    setSearchHistory(loadJson('co_search_history', []));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = themeMode === 'DARK'
        || (themeMode === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', dark);
    };
    apply();
    localStorage.setItem('co_theme', themeMode);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    if (themeMode === 'SYSTEM') media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [themeMode]);

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const setThemeMode = (mode: ThemeMode) => setThemeModeState(mode);
  const cycleThemeMode = () => {
    setThemeModeState((current) => current === 'SYSTEM' ? 'LIGHT' : current === 'LIGHT' ? 'DARK' : 'SYSTEM');
  };
  const setSelectedRegion = (region: string) => {
    setSelectedRegionState(region);
    localStorage.setItem('co_region', region);
  };
  const setSelectedLanguages = (languages: string[]) => {
    const next = languages.length ? languages : ['en'];
    setSelectedLanguagesState(next);
    saveJson('co_languages', next);
  };

  const lastStateTimeUpdateRef = useRef(0);
  const reportPlayback = useCallback((state: Partial<{
    isPlaying: boolean;
    isLoading: boolean;
    error: string | null;
    currentTime: number;
    duration: number;
    forceTimeUpdate?: boolean;
  }>) => {
    if (state.isPlaying !== undefined) setIsPlaying((prev) => (prev !== state.isPlaying ? state.isPlaying! : prev));
    if (state.isLoading !== undefined) setIsLoading((prev) => (prev !== state.isLoading ? state.isLoading! : prev));
    if (state.error !== undefined) setPlaybackError((prev) => (prev !== state.error ? state.error! : prev));
    if (state.duration !== undefined) {
      setDuration((prev) => (Math.abs(prev - state.duration!) >= 0.5 ? state.duration! : prev));
    }
    if (state.currentTime !== undefined) {
      currentTimeRef.current = state.currentTime;
      const now = Date.now();
      // Throttle React state updates so high-frequency timeupdates don't re-render StreamProvider and page.tsx
      if (state.forceTimeUpdate || now - lastStateTimeUpdateRef.current >= 3500) {
        lastStateTimeUpdateRef.current = now;
        setCurrentTime((prev) => (Math.abs(prev - state.currentTime!) >= 0.5 ? state.currentTime! : prev));
      }
    }
  }, []);

  const registerController = useCallback((controller: PlaybackController | null) => {
    controllerRef.current = controller;
  }, []);

  const resolveCurrentItem = useCallback((resolved: MediaItem) => {
    if (currentRef.current?.id !== resolved.id) return;
    setCurrentItem(resolved);
    currentRef.current = resolved;
    setQueue((items) => items.map((item) => item.id === resolved.id ? resolved : item));
    setRecentItems((items) => {
      const key = journeyKey(resolved);
      const next = compactRecentItems(items.map((item) => journeyKey(item) === key ? resolved : item));
      saveJson('co_recent', next);
      return next;
    });
  }, []);

  const playItem = useCallback((item: MediaItem, newQueue?: MediaItem[], shuffleFirst?: boolean) => {
    let nextQueue = newQueue?.length ? [...newQueue] : [item];
    if (shuffleFirst && nextQueue.length > 1) {
      nextQueue = [item, ...shuffled(nextQueue.filter((entry) => entry.id !== item.id))];
    }
    const index = Math.max(0, nextQueue.findIndex((entry) => entry.id === item.id));
    queueRef.current = nextQueue;
    queueIndexRef.current = index;
    currentRef.current = item;
    setQueue(nextQueue);
    setQueueIndex(index);
    setCurrentItem(item);
    setCurrentTime(0);
    setDuration(item.durationSeconds || 0);
    setPlaybackError(null);
    setIsLoading(true);
    setIsExpanded(true);
    setRecentItems((items) => {
      const next = putRecentItem(items, item);
      saveJson('co_recent', next);
      return next;
    });
  }, []);

  const replaceQueue = useCallback((items: MediaItem[], currentItemId?: string) => {
    if (!items.length) return;
    const activeId = currentItemId || currentRef.current?.id;
    const index = Math.max(0, items.findIndex((item) => item.id === activeId));
    queueRef.current = items;
    queueIndexRef.current = index;
    setQueue(items);
    setQueueIndex(index);
  }, []);

  const closePlayer = useCallback(() => {
    controllerRef.current?.pause();
    controllerRef.current = null;
    queueRef.current = [];
    queueIndexRef.current = 0;
    currentRef.current = null;
    setQueue([]);
    setQueueIndex(0);
    setCurrentItem(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackError(null);
    setIsLoading(false);
    setIsPlaying(false);
    setIsExpanded(false);
  }, []);

  const pause = useCallback(() => {
    controllerRef.current?.pause();
    setCurrentTime(currentTimeRef.current);
  }, []);
  const togglePlay = useCallback(() => {
    if (isPlaying) controllerRef.current?.pause();
    else controllerRef.current?.play();
  }, [isPlaying]);
  const seek = useCallback((seconds: number) => {
    const target = Math.max(0, seconds);
    controllerRef.current?.seek(target);
    currentTimeRef.current = target;
    setCurrentTime(target);
  }, []);
  const syncWithTime = useCallback((seconds: number) => {
    const target = Math.max(0, seconds);
    if (controllerRef.current?.syncWithTime) {
      controllerRef.current.syncWithTime(target);
    } else {
      controllerRef.current?.seek(target);
    }
    currentTimeRef.current = target;
  }, []);

  const goToIndex = useCallback((index: number) => {
    const items = queueRef.current;
    if (!items.length || index < 0 || index >= items.length) return;
    const item = items[index];
    queueIndexRef.current = index;
    currentRef.current = item;
    setQueueIndex(index);
    setCurrentItem(item);
    setCurrentTime(0);
    setDuration(item.durationSeconds || 0);
    setPlaybackError(null);
    setIsLoading(true);
    setRecentItems((recent) => {
      const next = putRecentItem(recent, item);
      saveJson('co_recent', next);
      return next;
    });
  }, []);

  const nextItem = useCallback(() => {
    const items = queueRef.current;
    if (!items.length) return;
    let next = queueIndexRef.current + 1;
    if (next >= items.length) {
      if (repeatRef.current === 'ALL') next = 0;
      else {
        controllerRef.current?.pause();
        setIsPlaying(false);
        return;
      }
    }
    goToIndex(next);
  }, [goToIndex]);

  const previousItem = useCallback(() => {
    if (currentTimeRef.current > 5) {
      controllerRef.current?.seek(0);
      return;
    }
    const items = queueRef.current;
    if (!items.length) return;
    let previous = queueIndexRef.current - 1;
    if (previous < 0) previous = items.length - 1;
    goToIndex(previous);
  }, [goToIndex]);

  const handleEnded = useCallback(() => {
    if (repeatRef.current === 'ONE') {
      controllerRef.current?.seek(0);
      controllerRef.current?.play();
      return;
    }
    nextItem();
  }, [nextItem]);

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    controllerRef.current?.setVolume(next);
  }, []);

  const cycleRepeatMode = () => {
    setRepeatMode((current) => current === 'OFF' ? 'ALL' : current === 'ALL' ? 'ONE' : 'OFF');
  };

  const toggleShuffle = () => {
    setShuffle((enabled) => {
      const nextEnabled = !enabled;
      const current = currentRef.current;
      if (nextEnabled && current && queueRef.current.length > 1) {
        const nextQueue = [current, ...shuffled(queueRef.current.filter((item) => item.id !== current.id))];
        queueRef.current = nextQueue;
        queueIndexRef.current = 0;
        setQueue(nextQueue);
        setQueueIndex(0);
      }
      return nextEnabled;
    });
  };

  const toggleWatchlist = (item: MediaItem) => {
    setWatchlist((items) => {
      const exists = items.some((entry) => entry.id === item.id);
      const next = exists ? items.filter((entry) => entry.id !== item.id) : [item, ...items];
      saveJson('co_watchlist', next);
      return next;
    });
  };
  const isWatchlisted = (id: string) => watchlist.some((item) => item.id === id);

  const createCollection = (title: string): UserCollection | null => {
    const clean = title.trim().slice(0, 48);
    if (!clean) return null;
    const collection: UserCollection = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: clean,
      items: [],
      createdAt: Date.now(),
    };
    setCollections((items) => {
      const next = [collection, ...items];
      saveJson('co_collections', next);
      return next;
    });
    return collection;
  };
  const deleteCollection = (id: string) => {
    setCollections((items) => {
      const next = items.filter((collection) => collection.id !== id);
      saveJson('co_collections', next);
      return next;
    });
  };
  const addToCollection = (collectionId: string, item: MediaItem) => {
    setCollections((items) => {
      const next = items.map((collection) => collection.id === collectionId
        ? {
            ...collection,
            items: collection.items.some((entry) => entry.id === item.id)
              ? collection.items
              : [...collection.items, item],
          }
        : collection);
      saveJson('co_collections', next);
      return next;
    });
  };
  const removeFromCollection = (collectionId: string, itemId: string) => {
    setCollections((items) => {
      const next = items.map((collection) => collection.id === collectionId
        ? { ...collection, items: collection.items.filter((item) => item.id !== itemId) }
        : collection);
      saveJson('co_collections', next);
      return next;
    });
  };

  const lastProgressStateUpdateRef = useRef(0);
  const updateWatchProgress = useCallback((itemId: string, position: number, total: number, force?: boolean) => {
    if (!Number.isFinite(position) || !Number.isFinite(total) || total <= 0) return;
    const current = currentRef.current;
    const rootKey = current ? journeyKey(current) : null;
    const now = Date.now();

    // Throttle React state updates to at most once every 3 seconds unless forced (pause/ended/unmount)
    if (!force && now - lastProgressStateUpdateRef.current < 3000 && position < total - 2) {
      return;
    }
    lastProgressStateUpdateRef.current = now;

    setWatchProgress((progress) => {
      const next = {
        ...progress,
        [itemId]: { position, duration: total, updatedAt: now },
      };
      if (rootKey) {
        next[rootKey] = { position, duration: total, updatedAt: now };
      }
      if (current?.id && current.id !== itemId) {
        next[current.id] = { position, duration: total, updatedAt: now };
      }
      if (now - lastProgressSaveRef.current > 4000 || position >= total - 2 || force) {
        saveJson('co_progress', next);
        lastProgressSaveRef.current = now;
      }
      return next;
    });

    if (current && (now - lastProgressSaveRef.current > 4000 || position >= total - 2 || force)) {
      setRecentItems((items) => {
        const next = putRecentItem(items, current);
        saveJson('co_recent', next);
        return next;
      });
    }
  }, []);

  const addSearchHistory = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setSearchHistory((items) => {
      const next = [clean, ...items.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      saveJson('co_search_history', next);
      return next;
    });
  };
  const removeSearchHistory = (term: string) => {
    setSearchHistory((items) => {
      const next = items.filter((item) => item !== term);
      saveJson('co_search_history', next);
      return next;
    });
  };
  const clearSearchHistory = () => {
    setSearchHistory([]);
    saveJson('co_search_history', []);
  };

  const setSleepTimer = (minutes: number | null) => {
    if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    sleepTimerRef.current = null;
    setSleepTimerMinutes(minutes);
    setSleepRemainingSeconds(minutes ? minutes * 60 : 0);
    if (!minutes) return;
    let remaining = minutes * 60;
    sleepTimerRef.current = setInterval(() => {
      remaining -= 1;
      setSleepRemainingSeconds(Math.max(0, remaining));
      if (remaining <= 0) {
        if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
        setSleepTimerMinutes(null);
        controllerRef.current?.pause();
      }
    }, 1000);
  };

  useEffect(() => () => {
    if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
  }, []);

  useEffect(() => {
    if (!currentItem || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentItem.title,
      artist: (currentItem.genres || []).join(' • ') || (currentItem.mediaType === 'movie' ? 'Movie' : 'Series'),
      album: 'Co Stream',
      artwork: currentItem.posterUrl ? [{ src: currentItem.posterUrl }] : [],
    });
    try {
      navigator.mediaSession.setActionHandler('play', () => controllerRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => controllerRef.current?.pause());
      navigator.mediaSession.setActionHandler('nexttrack', nextItem);
      navigator.mediaSession.setActionHandler('previoustrack', previousItem);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) controllerRef.current?.seek(details.seekTime);
      });
    } catch (_) {
      // Unsupported action handlers differ between browsers.
    }
  }, [currentItem, nextItem, previousItem]);

  return (
    <StreamContext.Provider value={{
      themeMode,
      setThemeMode,
      cycleThemeMode,
      selectedRegion,
      setSelectedRegion,
      selectedLanguages,
      setSelectedLanguages,
      isOnline,
      currentItem,
      queue,
      queueIndex,
      isExpanded,
      setIsExpanded,
      isPlaying,
      isLoading,
      playbackError,
      currentTime,
      duration,
      volume,
      repeatMode,
      shuffle,
      playItem,
      closePlayer,
      replaceQueue,
      resolveCurrentItem,
      togglePlay,
      pause,
      seek,
      syncWithTime,
      nextItem,
      previousItem,
      handleEnded,
      setVolume,
      cycleRepeatMode,
      toggleShuffle,
      registerController,
      reportPlayback,
      watchlist,
      toggleWatchlist,
      isWatchlisted,
      recentItems,
      collections,
      createCollection,
      deleteCollection,
      addToCollection,
      removeFromCollection,
      watchProgress,
      updateWatchProgress,
      searchHistory,
      addSearchHistory,
      removeSearchHistory,
      clearSearchHistory,
      sleepTimerMinutes,
      sleepRemainingSeconds,
      setSleepTimer,
    }}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (!context) throw new Error('useStream must be used inside StreamProvider');
  return context;
}
