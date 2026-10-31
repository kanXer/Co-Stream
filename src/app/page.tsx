'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Compass,
  Download,
  Film,
  History,
  House,
  Mic,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Tv,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { AUTH_EVENT, getSession, type CoProfile } from '@/components/AuthGate';
import { DetailsSheet } from '@/components/DetailsSheet';
import { MediaCard } from '@/components/MediaCard';
import { OfflineLibrary } from '@/components/OfflineLibrary';
import { PlatformPicker } from '@/components/PlatformPicker';
import { SettingsModal } from '@/components/SettingsModal';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AVAILABLE_LANGUAGES, useStream } from '@/context/StreamContext';
import {
  DEFAULT_STREAMING_PLATFORMS,
  STREAMING_PLATFORMS,
  isStreamingPlatformId,
  type StreamingPlatformId,
} from '@/lib/platforms';
import { prefetchNetMirrorPlayback } from '@/lib/playbackClient';
import type { CatalogPayload, MediaItem } from '@/types';

type Tab = 'home' | 'movie' | 'tv' | 'search' | 'offline';
type SearchFilter = 'all' | 'movie' | 'tv';

const DISCOVERY_CHIPS = ['Action', 'Comedy', 'Animation', 'Science fiction', 'Thriller', 'Romance', 'Documentary', 'Family'];

export default function HomePage() {
  const {
    selectedRegion,
    selectedLanguages,
    playItem,
    recentItems,
    searchHistory,
    addSearchHistory,
    removeSearchHistory,
    clearSearchHistory,
    isOnline,
    currentItem,
    isExpanded,
    setIsExpanded,
    closePlayer,
  } = useStream();
  const [tab, setTab] = useState<Tab>('home');
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<CoProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [platforms, setPlatforms] = useState<StreamingPlatformId[]>(DEFAULT_STREAMING_PLATFORMS);
  const [platformReady, setPlatformReady] = useState(false);
  const [platformPickerOpen, setPlatformPickerOpen] = useState(false);
  const [showBackExitHint, setShowBackExitHint] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogCacheRef = useRef<Record<string, CatalogPayload>>({});
  const lastRootBack = useRef(0);
  const backNavigationState = useRef({
    tab: 'home' as Tab,
    selectedItem: false,
    settingsOpen: false,
    platformPickerOpen: false,
    platformReady: false,
    isExpanded: false,
    hasPlayer: false,
  });

  const loadHome = useCallback(async (force?: boolean | React.MouseEvent | unknown) => {
    if (!platformReady || tab === 'search' || tab === 'offline') return;
    const isForce = typeof force === 'boolean' ? force : false;
    const language = selectedLanguages[0] || 'en';
    const view = tab === 'tv' ? 'tv' : tab === 'movie' ? 'movie' : 'home';
    const platformsKey = platforms.join(',');
    const cacheKey = `${selectedRegion}:${language}:${view}:${platformsKey}`;

    if (!isForce && catalogCacheRef.current[cacheKey]) {
      setCatalog(catalogCacheRef.current[cacheKey]);
      setHomeLoading(false);
      setHomeError(null);
      return;
    }

    if (catalogCacheRef.current[cacheKey]) {
      setCatalog(catalogCacheRef.current[cacheKey]);
    } else {
      setHomeLoading(true);
    }
    setHomeError(null);

    try {
      const response = await fetch(`/api/catalog?region=${encodeURIComponent(selectedRegion)}&language=${encodeURIComponent(language)}&view=${view}&platforms=${encodeURIComponent(platformsKey)}`);
      if (!response.ok) throw new Error('Could not load discovery feed.');
      const data = await response.json() as CatalogPayload;
      catalogCacheRef.current[cacheKey] = data;
      setCatalog(data);
    } catch (error) {
      if (!catalogCacheRef.current[cacheKey]) {
        setHomeError(error instanceof Error ? error.message : 'Could not load discovery feed.');
      }
    } finally {
      setHomeLoading(false);
    }
  }, [platformReady, platforms, selectedRegion, selectedLanguages, tab]);

  useEffect(() => { void loadHome(); }, [loadHome]);

  // Idle prefetch for Movies and Web Series tabs when Home is loaded
  useEffect(() => {
    if (!platformReady || tab !== 'home' || !catalog) return;
    const timer = setTimeout(() => {
      const language = selectedLanguages[0] || 'en';
      const platformsKey = platforms.join(',');
      (['movie', 'tv'] as const).forEach(async (prefetchView) => {
        const key = `${selectedRegion}:${language}:${prefetchView}:${platformsKey}`;
        if (!catalogCacheRef.current[key]) {
          try {
            const res = await fetch(`/api/catalog?region=${encodeURIComponent(selectedRegion)}&language=${encodeURIComponent(language)}&view=${prefetchView}&platforms=${encodeURIComponent(platformsKey)}`);
            if (res.ok) {
              catalogCacheRef.current[key] = await res.json() as CatalogPayload;
            }
          } catch {
            // Silently ignore idle prefetch failure
          }
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [catalog, platformReady, platforms, selectedLanguages, selectedRegion, tab]);

  useEffect(() => {
    let ready = false;
    try {
      const saved = JSON.parse(localStorage.getItem('co_platforms_v1') || '[]') as string[];
      const valid = saved.filter(isStreamingPlatformId);
      if (valid.length) {
        setPlatforms(valid);
        ready = true;
      }
      else setPlatformPickerOpen(true);
    } catch {
      setPlatformPickerOpen(true);
    } finally {
      setPlatformReady(ready);
    }
  }, []);

  useEffect(() => {
    const syncProfile = () => setProfile(getSession());
    syncProfile();
    window.addEventListener(AUTH_EVENT, syncProfile);
    return () => window.removeEventListener(AUTH_EVENT, syncProfile);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'search' || hash === 'movie' || hash === 'tv' || hash === 'offline') setTab(hash);
    const sharedTitle = new URLSearchParams(window.location.search).get('title');
    const query = new URLSearchParams(window.location.search).get('q') || sharedTitle;
    if (query) {
      setSearchQuery(query);
      setTab('search');
    }
    // (debug auto-play removed)
  }, []);

  useEffect(() => {
    backNavigationState.current = {
      tab,
      selectedItem: Boolean(selectedItem),
      settingsOpen,
      platformPickerOpen,
      platformReady,
      isExpanded,
      hasPlayer: Boolean(currentItem),
    };
  }, [tab, selectedItem, settingsOpen, platformPickerOpen, platformReady, isExpanded, currentItem]);

  useEffect(() => {
    const guardKey = '__coStreamBackGuard';
    const armBackGuard = () => {
      window.history.pushState({ ...window.history.state, [guardKey]: true }, '', window.location.href);
    };
    if (!window.history.state?.[guardKey]) armBackGuard();

    const clearExitHint = () => {
      setShowBackExitHint(false);
      if (backExitTimer.current) clearTimeout(backExitTimer.current);
      backExitTimer.current = null;
    };
    const consumeBack = (action: () => void) => {
      lastRootBack.current = 0;
      clearExitHint();
      action();
      armBackGuard();
    };
    const onPopState = () => {
      const state = backNavigationState.current;
      if (document.fullscreenElement) {
        consumeBack(() => { void document.exitFullscreen().catch(() => undefined); });
        return;
      }
      if (state.isExpanded) {
        consumeBack(() => setIsExpanded(false));
        return;
      }
      if (state.selectedItem) {
        consumeBack(() => setSelectedItem(null));
        return;
      }
      if (state.settingsOpen) {
        consumeBack(() => setSettingsOpen(false));
        return;
      }
      if (state.platformPickerOpen && state.platformReady) {
        consumeBack(() => setPlatformPickerOpen(false));
        return;
      }
      if (state.tab !== 'home') {
        consumeBack(() => setTab('home'));
        return;
      }
      if (state.hasPlayer) {
        consumeBack(closePlayer);
        return;
      }

      const now = Date.now();
      if (now - lastRootBack.current <= 1800) {
        clearExitHint();
        window.removeEventListener('popstate', onPopState);
        window.history.back();
        return;
      }
      lastRootBack.current = now;
      setShowBackExitHint(true);
      if (backExitTimer.current) clearTimeout(backExitTimer.current);
      backExitTimer.current = setTimeout(() => {
        setShowBackExitHint(false);
        lastRootBack.current = 0;
      }, 1800);
      armBackGuard();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (backExitTimer.current) clearTimeout(backExitTimer.current);
    };
  }, [closePlayer, setIsExpanded]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&filter=${searchFilter}&region=${selectedRegion}`);
        const payload = await response.json() as { mode: 'netmirror'; results: MediaItem[] };
        setSearchResults(payload.results || []);
      } catch (_) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, searchFilter, selectedRegion]);

  const runSearch = (query: string) => {
    setSearchQuery(query);
    addSearchHistory(query);
    setTab('search');
  };

  const savePlatforms = (next: StreamingPlatformId[]) => {
    if (!next.length) return;
    setPlatforms(next);
    localStorage.setItem('co_platforms_v1', JSON.stringify(next));
    setPlatformReady(true);
    setPlatformPickerOpen(false);
  };

  const openItem = (item: MediaItem) => setSelectedItem(item);
  const playFrom = (item: MediaItem, items: MediaItem[]) => playItem(item, items);
  const spotlight = (catalog?.spotlight || []).filter((item) => !isBlockedMediaItem(item));
  // Fallback: use first section item if no spotlight available
  const featuredQueue = (catalog?.sections[0]?.items || []).filter((item) => !isBlockedMediaItem(item));
  const languageName = AVAILABLE_LANGUAGES.find((language) => language.code === selectedLanguages[0])?.name || 'your language';
  const [greeting, setGreeting] = useState('Good evening');
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  }, []);
  // Reset spotlight index when catalog refreshes
  useEffect(() => { setSpotlightIdx(0); }, [catalog]);
  // Auto-rotate through spotlight items every 5 seconds
  useEffect(() => {
    if (spotlight.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIdx((idx) => (idx + 1) % spotlight.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [spotlight.length]);
  const heroItem = spotlight.length > 0 ? spotlight[spotlightIdx] : (catalog?.sections[0]?.items.filter((item) => !isBlockedMediaItem(item))[0] || null);
  useEffect(() => {
    // Only prefetch playback for items that are streamable
    if (!heroItem?.playback) return;
    const timer = window.setTimeout(() => prefetchNetMirrorPlayback(heroItem), 450);
    return () => window.clearTimeout(timer);
  }, [heroItem]);

  return (
    <div className={`min-h-screen min-w-0 max-w-full overflow-x-clip text-[var(--text)] ${currentItem ? 'pb-52' : 'pb-28'}`}>
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/78 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => setTab('home')} className="flex items-center gap-2.5">
            <span className="relative w-10 h-10 rounded-2xl overflow-hidden shadow-lg"><Image src="/icon-192.png" alt="" fill sizes="40px" className="object-cover" priority /></span>
            <span className="text-left"><span className="block text-lg font-black tracking-[-0.04em] leading-none">Co-Stream</span><span className="block text-[8px] font-black uppercase tracking-[.15em] text-[var(--accent)] mt-1">Cinema, together</span></span>
          </button>
          <nav className="hidden md:flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
            <TopNav active={tab === 'home'} onClick={() => setTab('home')} icon={<House size={15} />} label="Home" />
            <TopNav active={tab === 'movie'} onClick={() => setTab('movie')} icon={<Film size={15} />} label="Movies" />
            <TopNav active={tab === 'tv'} onClick={() => setTab('tv')} icon={<Tv size={15} />} label="Web Series" />
            <TopNav active={tab === 'offline'} onClick={() => setTab('offline')} icon={<Download size={15} />} label="Offline" />
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setPlatformPickerOpen(true)} className="icon-button" title="Choose platforms"><SlidersHorizontal size={17} /></button>
            <button onClick={() => setTab('search')} className="icon-button"><Search size={17} /></button>
            <button onClick={() => void loadHome(true)} className="icon-button hidden sm:flex" title="Refresh feed"><RefreshCw size={17} className={homeLoading ? 'animate-spin text-[var(--accent)]' : ''} /></button>
            <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden flex items-center justify-center text-[var(--text-muted)]">
              {profile?.photoUrl ? <img src={profile.photoUrl} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserRound size={17} />}
            </button>
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6">
        {tab === 'home' && (
          <div className="page-enter min-w-0 pt-5 sm:pt-7 space-y-10">
            <div><p className="text-xs font-semibold text-[var(--text-muted)]">{greeting}, {profile?.name || 'viewer'}</p><h1 className="page-title mt-1">What will we watch?</h1></div>

            {heroItem ? (
              <section className="relative min-h-[390px] sm:min-h-[440px] rounded-[30px] overflow-hidden border border-[var(--line)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
                {(heroItem.backdropUrl || heroItem.posterUrl) && <Image key={heroItem.id} src={(heroItem.backdropUrl || heroItem.posterUrl)!} alt={heroItem.title} fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover transition-opacity duration-700" />}
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/5" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="relative z-10 min-h-[390px] sm:min-h-[440px] flex flex-col justify-end sm:justify-center p-6 sm:p-10 max-w-2xl text-white">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#7fffd2]">
                    {heroItem.mediaType === 'tv' ? '🔥 Latest Series' : '🎬 Latest Release'}
                  </p>
                  <h2 className="text-4xl sm:text-6xl font-black tracking-[-.055em] leading-[.92] mt-3 text-balance">{heroItem.title}</h2>
                  <div className="flex items-center gap-2.5 mt-4 text-xs font-bold text-white/70"><span>{heroItem.year}</span>{heroItem.rating > 0 && <><span>•</span><span className="inline-flex items-center gap-1 text-amber-300"><Star size={12} className="fill-current" />{heroItem.rating.toFixed(1)}</span></>}<span>•</span><span>{heroItem.mediaType === 'tv' ? 'Series' : 'Movie'}</span></div>
                  {heroItem.overview && <p className="mt-4 text-sm leading-6 text-white/65 line-clamp-3 max-w-xl">{heroItem.overview}</p>}
                  <div className="flex flex-wrap gap-2.5 mt-6">
                    <button onClick={() => openItem(heroItem)} className="hero-primary"><Play size={18} className="fill-current" />Play now</button>
                    <button onClick={() => openItem(heroItem)} className="hero-secondary"><Film size={17} />Details</button>
                  </div>
                </div>
                {/* Spotlight dot indicators */}
                {spotlight.length > 1 && (
                  <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5">
                    {spotlight.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSpotlightIdx(idx)}
                        aria-label={`Slide ${idx + 1}`}
                        className={`rounded-full transition-all duration-300 ${idx === spotlightIdx ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : homeLoading ? <HeroSkeleton /> : null}

            <div className="flex max-w-full gap-2 overflow-x-auto no-scrollbar">
              {platforms.map((platformId) => {
                const platform = STREAMING_PLATFORMS.find((entry) => entry.id === platformId);
                return platform ? <button key={platform.id} onClick={() => setPlatformPickerOpen(true)} className="filter-chip"><span className="w-2 h-2 rounded-full" style={{ background: platform.color }} />{platform.label}</button> : null;
              })}
              {[languageName, ...DISCOVERY_CHIPS.slice(0, 6)].map((chip) => <button key={chip} onClick={() => runSearch(chip)} className="filter-chip">{chip}</button>)}
            </div>

            {recentItems.length > 0 && (
              <MediaSection title="Continue your journey" subtitle="Recently opened on this device" items={recentItems.slice(0, 12)} onOpen={openItem} onPlay={(item) => playFrom(item, recentItems)} />
            )}

            {homeError ? (
              <div className="min-h-56 rounded-[28px] border border-[var(--line)] bg-[var(--panel)] flex flex-col items-center justify-center gap-3 text-center p-6"><WifiOff size={28} className="text-red-500" /><h3 className="font-black">The feed missed its cue</h3><p className="text-xs text-[var(--text-muted)]">{homeError}</p><button onClick={loadHome} className="primary-button"><RefreshCw size={15} />Try again</button></div>
            ) : homeLoading && !catalog ? <SectionSkeleton /> : catalog?.sections.map((section) => (
              <MediaSection key={section.id} title={section.title} subtitle={section.subtitle} items={section.items} ranked={section.id.startsWith('top10-')} onOpen={openItem} onPlay={(item) => playFrom(item, section.items)} />
            ))}

            <footer className="py-7 border-t border-[var(--line)] text-center text-[10px] leading-relaxed text-[var(--text-faint)]">Co-Stream · Movies and series in one place</footer>
          </div>
        )}

        {(tab === 'movie' || tab === 'tv') && (
          <div className="page-enter min-w-0 pt-5 sm:pt-7 pb-8 space-y-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{tab === 'movie' ? 'Big screen picks' : 'Binge by season'}</p>
                <h1 className="page-title">{tab === 'movie' ? 'Movies' : 'Web Series'}</h1>
                <p className="page-subtitle">{tab === 'movie' ? 'Latest updates and platform top tens.' : 'Fresh shows, complete seasons, and episode-wise playback.'}</p>
              </div>
              <button onClick={() => setPlatformPickerOpen(true)} className="secondary-button shrink-0"><SlidersHorizontal size={16} />Platforms</button>
            </div>
            {homeError ? (
              <div className="min-h-56 rounded-[28px] border border-[var(--line)] bg-[var(--panel)] flex flex-col items-center justify-center gap-3 text-center p-6"><WifiOff size={28} className="text-red-500" /><h3 className="font-black">Could not load titles</h3><button onClick={loadHome} className="primary-button"><RefreshCw size={15} />Try again</button></div>
            ) : homeLoading ? <SectionSkeleton /> : catalog?.sections.map((section) => (
              <MediaSection key={section.id} title={section.title} subtitle={section.subtitle} items={section.items} ranked={section.id.startsWith('top10-')} onOpen={openItem} onPlay={(item) => playFrom(item, section.items)} />
            ))}
          </div>
        )}

        {tab === 'search' && (
          <div className="page-enter min-w-0 pt-5 sm:pt-7">
            <div><p className="eyebrow">Find your next story</p><h1 className="page-title">Search</h1><p className="page-subtitle">Search movies and web series.</p></div>
            <div className="search-field mt-3"><Search size={18} className="text-[var(--accent)]" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runSearch(searchQuery)} placeholder="Search titles…" />{searchQuery && <button onClick={() => setSearchQuery('')}><X size={16} /></button>}<VoiceSearch onResult={runSearch} /></div>
            <div className="flex gap-2 mt-3">{(['all', 'movie', 'tv'] as SearchFilter[]).map((filter) => <button key={filter} onClick={() => setSearchFilter(filter)} className={`filter-chip ${searchFilter === filter ? 'active' : ''}`}>{filter === 'all' ? 'Everything' : filter === 'movie' ? 'Movies' : 'Series'}</button>)}</div>
            {searching && <div className="h-1 rounded-full bg-[var(--panel)] overflow-hidden mt-4"><div className="h-full w-1/3 bg-[var(--accent)] animate-[searchslide_1s_ease-in-out_infinite]" /></div>}

            {!searchQuery.trim() ? (
              <div className="mt-7 grid lg:grid-cols-[1fr_1fr] gap-7">
                <section>
                  <div className="flex items-center justify-between"><h2 className="text-lg font-black">Recent searches</h2>{searchHistory.length > 0 && <button onClick={clearSearchHistory} className="small-pill">Clear</button>}</div>
                  {!searchHistory.length ? <p className="text-xs text-[var(--text-muted)] mt-4">Searches you run will appear here.</p> : <div className="mt-3 space-y-1">{searchHistory.map((term) => <div key={term} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-[var(--panel)]"><History size={15} className="text-[var(--text-faint)]" /><button onClick={() => runSearch(term)} className="flex-1 text-left text-sm font-semibold truncate">{term}</button><button onClick={() => removeSearchHistory(term)} className="text-[var(--text-faint)]"><X size={14} /></button></div>)}</div>}
                </section>
                <section><h2 className="text-lg font-black">Browse by mood</h2><div className="flex flex-wrap gap-2 mt-3">{DISCOVERY_CHIPS.map((chip) => <button key={chip} onClick={() => runSearch(chip)} className="filter-chip">{chip}</button>)}</div><div className="mt-5 rounded-[26px] border border-[var(--line)] bg-[var(--panel)] p-5 flex gap-4"><span className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0"><Compass size={22} /></span><div><h3 className="text-sm font-black">One search, every platform</h3><p className="text-[11px] leading-5 text-[var(--text-muted)] mt-1">Find movies and series across your selected services.</p></div></div></section>
              </div>
            ) : (
              <section className="mt-6 pb-8">
                <div className="flex items-end justify-between"><div><p className="eyebrow">Search results</p><h2 className="text-xl font-black">Results for “{searchQuery}”</h2></div><span className="text-[10px] font-bold text-[var(--text-faint)]">{searchResults.length} found</span></div>
                {!searching && searchResults.length === 0 ? <div className="min-h-56 flex flex-col items-center justify-center text-center"><Search size={28} className="text-[var(--text-faint)]" /><h3 className="font-black mt-3">No matching titles</h3><p className="text-xs text-[var(--text-muted)] mt-1">Try another title, genre, or language.</p></div> : <div className="responsive-media-grid mt-5">{searchResults.map((item) => <MediaCard key={item.id} item={item} onOpen={openItem} onPlay={() => playFrom(item, searchResults)} />)}</div>}
              </section>
            )}
          </div>
        )}

        {tab === 'offline' && <OfflineLibrary />}

      </main>

      {!isOnline && <div className="fixed top-19 left-1/2 -translate-x-1/2 z-40 rounded-full border border-amber-500/30 bg-[var(--panel-elevated)]/95 backdrop-blur-xl px-4 py-2 flex items-center gap-2 shadow-lg"><WifiOff size={14} className="text-amber-500" /><span className="text-[10px] font-black">Offline • downloads remain available</span></div>}

      {showBackExitHint && <div className={`fixed left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--panel-elevated)]/95 px-4 py-2.5 text-[11px] font-black shadow-2xl backdrop-blur-2xl ${currentItem ? 'bottom-[calc(11rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]'}`}>Press back again to exit</div>}

      <VideoPlayer />

      <nav className="fixed bottom-0 left-0 right-0 z-40 h-[calc(4.5rem+env(safe-area-inset-bottom,0px))] max-w-full overflow-hidden pb-[env(safe-area-inset-bottom,0px)] border-t border-[var(--line)] bg-[var(--bg)]/93 backdrop-blur-2xl md:hidden flex items-center justify-around">
        <BottomNav active={tab === 'home'} onClick={() => setTab('home')} icon={<House size={20} />} label="Home" />
        <BottomNav active={tab === 'movie'} onClick={() => setTab('movie')} icon={<Film size={20} />} label="Movies" />
        <BottomNav active={tab === 'tv'} onClick={() => setTab('tv')} icon={<Tv size={20} />} label="Web Series" />
        <BottomNav active={tab === 'offline'} onClick={() => setTab('offline')} icon={<Download size={20} />} label="Offline" />
      </nav>

      {selectedItem && <DetailsSheet item={selectedItem} onClose={() => setSelectedItem(null)} onSelect={setSelectedItem} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={profile} />
      <PlatformPicker open={platformPickerOpen} selected={platforms} required={!platformReady} onClose={() => setPlatformPickerOpen(false)} onSave={savePlatforms} />
    </div>
  );
}

function isBlockedMediaItem(item: { id?: string; providerId?: string; catalogId?: number; title?: string }) {
  if (item.catalogId === 15226) return true;
  if (item.id && /15226/.test(item.id)) return true;
  if (item.providerId && /15226/.test(item.providerId)) return true;
  if (!item.title) return false;
  const t = item.title.trim().toLowerCase();
  const clean = t.replace(/[^a-z0-9]/g, '');
  if (clean === 'cid' || clean.startsWith('cid')) return true;
  if (/\b(c\.?\s*i\.?\s*d\.?)\b/i.test(t)) return true;
  if (/crime\s+investigation\s+department/i.test(t)) return true;
  return false;
}

function MediaSection({
  title,
  subtitle,
  items,
  onOpen,
  onPlay,
  ranked = false,
}: {
  title: string;
  subtitle: string;
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  ranked?: boolean;
}) {
  const visibleItems = items.filter((item) => !isBlockedMediaItem(item));
  if (!visibleItems.length) return null;
  return (
    <section className="mb-8 sm:mb-10">
      <div className="section-heading mb-4">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        <span className="text-[10px] font-bold text-[var(--text-faint)] shrink-0">
          {visibleItems.length} titles
        </span>
      </div>
      <div className="media-grid-scroll mt-4">
        {visibleItems.map((item, index) => (
          <MediaCard
            key={item.id}
            item={item}
            onOpen={onOpen}
            onPlay={onPlay}
            rank={ranked && index < 10 ? index + 1 : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function TopNav({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition ${active ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`}>{icon}{label}</button>;
}

function BottomNav({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className="min-w-0 flex-1 flex flex-col items-center gap-1 px-1 py-1"><span className={`w-12 max-w-full h-7 rounded-full flex items-center justify-center transition ${active ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-faint)]'}`}>{icon}</span><span className={`max-w-full truncate text-[9px] font-black ${active ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'}`}>{label}</span></button>;
}

function VoiceSearch({ onResult }: { onResult: (query: string) => void }) {
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);
  if (!supported) return null;
  const start = () => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };
  return <button onClick={start} title="Voice search" className={listening ? 'text-[var(--accent)] animate-pulse' : 'text-[var(--text-muted)]'}><Mic size={18} /></button>;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
type SpeechRecognitionLike = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

function HeroSkeleton() {
  return <div className="min-h-[390px] rounded-[30px] bg-[var(--panel)] border border-[var(--line)] animate-pulse flex items-end p-8"><div className="space-y-3 w-full max-w-md"><div className="h-3 w-28 bg-[var(--panel-elevated)] rounded" /><div className="h-12 w-3/4 bg-[var(--panel-elevated)] rounded-xl" /><div className="h-4 w-full bg-[var(--panel-elevated)] rounded" /></div></div>;
}

function SectionSkeleton() {
  return <div className="space-y-3 animate-pulse"><div className="h-7 w-48 rounded-lg bg-[var(--panel)]" /><div className="flex gap-4 overflow-hidden">{[1, 2, 3, 4, 5].map((id) => <div key={id} className="w-[154px] sm:w-[176px] shrink-0"><div className="aspect-[2/3] rounded-[22px] bg-[var(--panel)]" /><div className="h-3 rounded bg-[var(--panel)] mt-3" /></div>)}</div></div>;
}
