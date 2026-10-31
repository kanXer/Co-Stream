'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  Bookmark,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  EyeOff,
  FastForward,
  Languages,
  ListVideo,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  RotateCw,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sun,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useStream, journeyKey, type PlaybackController } from '@/context/StreamContext';
import { OfflineButton } from '@/components/OfflineButton';
import { getOfflinePlaybackUrl, isVideoDownloaded, startVideoDownload } from '@/lib/offlineStore';
import { useDownloadedIds, useDownloadState } from '@/lib/offlineHooks';
import { resolveNetMirrorPlayback } from '@/lib/playbackClient';
import { BufferingOverlay } from '@/components/player/BufferingOverlay';
import { CinemaScrubber } from '@/components/player/CinemaScrubber';
import { MiniScrubber } from '@/components/player/MiniScrubber';
import { PlayerCenterControls } from '@/components/player/PlayerCenterControls';
import { PlayerEpisodesSection } from '@/components/player/PlayerEpisodesSection';
import { PlayerSidebarDetails } from '@/components/player/PlayerSidebarDetails';
import { PlayerTopBar } from '@/components/player/PlayerTopBar';
import { PlayerSettingsModal } from '@/components/player/PlayerSettingsModal';
import Hls from 'hls.js';
import type { MediaDetails, MediaEpisode, MediaItem, PlaybackSource } from '@/types';

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState?: () => number;
  setVolume: (volume: number) => void;
  destroy: () => void;
};

type YouTubeEvent = { data: number; target: YouTubePlayer };
type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: YouTubePlayer }) => void;
      onStateChange: (event: YouTubeEvent) => void;
      onError: () => void;
    };
  }) => YouTubePlayer;
};

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  const ytWindow = window as Window & {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (ytWindow.YT?.Player) return Promise.resolve(ytWindow.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingCallback = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      existingCallback?.();
      if (ytWindow.YT) resolve(ytWindow.YT);
      else reject(new Error('YouTube player API did not initialize.'));
    };
    if (!document.getElementById('co-youtube-api')) {
      const script = document.createElement('script');
      script.id = 'co-youtube-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => reject(new Error('Could not load the official trailer player.'));
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function seriesTitle(title: string) {
  return title.replace(/\s*•\s*S\d+\s*E\d+.*$/i, '').trim();
}

function buildEpisodeQueue(item: MediaItem, episodes: MediaEpisode[], season: number) {
  const activeEpisode = item.selectedEpisode || episodes[0]?.number || 1;
  const baseId = item.id.replace(/-s\d+e\d+$/i, '');
  const title = seriesTitle(item.title);
  return episodes.map((episode) => {
    if (episode.number === activeEpisode) {
      return { ...item, selectedSeason: season, selectedEpisode: episode.number, episodes };
    }
    return {
      ...item,
      id: `${baseId}-s${season}e${episode.number}`,
      title: `${title} • S${season} E${episode.number}${episode.name ? ` — ${episode.name}` : ''}`,
      overview: episode.overview || item.overview,
      backdropUrl: episode.stillUrl || item.backdropUrl,
      durationSeconds: episode.runtimeMinutes * 60,
      selectedSeason: season,
      selectedEpisode: episode.number,
      episodes,
      playback: null,
    };
  });
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

async function lockScreenOrientation() {
  if (typeof window === 'undefined') return false;
  try {
    const orientation = (window.screen?.orientation || (screen as unknown as { orientation?: LockableOrientation })?.orientation) as LockableOrientation | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      try {
        await orientation.lock('landscape');
        return true;
      } catch {
        try {
          await orientation.lock('landscape-primary');
          return true;
        } catch {
          return false;
        }
      }
    }
    const legacy = screen as unknown as {
      lockOrientation?: (o: string) => boolean;
      mozLockOrientation?: (o: string) => boolean;
      msLockOrientation?: (o: string) => boolean;
    };
    const legacyLock = legacy?.lockOrientation || legacy?.mozLockOrientation || legacy?.msLockOrientation;
    if (typeof legacyLock === 'function') {
      legacyLock.call(screen, 'landscape');
      return true;
    }
  } catch {}
  return false;
}

function unlockScreenOrientation() {
  if (typeof window === 'undefined') return;
  try {
    const orientation = (window.screen?.orientation || (screen as unknown as { orientation?: LockableOrientation })?.orientation) as LockableOrientation | undefined;
    if (orientation && typeof orientation.unlock === 'function') {
      orientation.unlock();
      return;
    }
    const legacy = screen as unknown as {
      unlockOrientation?: () => boolean;
      mozUnlockOrientation?: () => boolean;
      msUnlockOrientation?: () => boolean;
    };
    const legacyUnlock = legacy?.unlockOrientation || legacy?.mozUnlockOrientation || legacy?.msUnlockOrientation;
    if (typeof legacyUnlock === 'function') {
      legacyUnlock.call(screen);
    }
  } catch {}
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer() {
  const {
    currentItem,
    closePlayer,
    playItem,
    replaceQueue,
    resolveCurrentItem,
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
    togglePlay,
    seek,
    nextItem,
    previousItem,
    handleEnded,
    setVolume,
    cycleRepeatMode,
    toggleShuffle,
    registerController,
    reportPlayback,
    toggleWatchlist,
    isWatchlisted,
    watchProgress,
    updateWatchProgress,
    themeMode,
    cycleThemeMode,
    sleepTimerMinutes,
    sleepRemainingSeconds,
    setSleepTimer,
  } = useStream();

  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerMenu, setPlayerMenu] = useState<'settings' | 'speed' | 'picture' | 'quality' | 'subtitles' | 'audio' | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [selectedSubtitle, setSelectedSubtitle] = useState('off');
  const [selectedAudio, setSelectedAudio] = useState('Original');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [switchingSource, setSwitchingSource] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<'left' | 'right' | null>(null);
  const [controlPulse, setControlPulse] = useState<'play' | 'pause' | null>(null);
  const [videoFit, setVideoFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [fitFeedback, setFitFeedback] = useState<string | null>(null);
  const [episodeSeason, setEpisodeSeason] = useState(1);
  const [playerEpisodes, setPlayerEpisodes] = useState<MediaEpisode[]>([]);
  const [relatedItems, setRelatedItems] = useState<MediaItem[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [switchingEpisode, setSwitchingEpisode] = useState<number | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockBanner, setShowUnlockBanner] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [hudBrightness, setHudBrightness] = useState<number | null>(null);
  const [hudVolume, setHudVolume] = useState<number | null>(null);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);
  const [hlsLevels, setHlsLevels] = useState<Array<{ id: number; label: string; height: number }>>([]);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<Array<{ id: number; label: string }>>([]);
  const [isBuffering, setIsBuffering] = useState(false);
  const isHls = Boolean(directUrl && (directUrl.includes('.m3u8') || source?.mimeType?.includes('mpegurl')));

  const networkRetryCountRef = useRef(0);
  const mediaRetryCountRef = useRef(0);
  const nativeRetryCountRef = useRef(0);
  const networkRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driftCompensationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intendedPlayingRef = useRef(false);
  const playbackSpeedRef = useRef(playbackSpeed);
  const wasPausedRef = useRef(false);
  const selectedQualityRef = useRef(selectedQuality);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    selectedQualityRef.current = selectedQuality;
  }, [selectedQuality]);

  const downloadedIds = useDownloadedIds();
  const downloadState = useDownloadState(currentItem?.id);
  const isDownloaded = Boolean(currentItem && (downloadedIds.has(currentItem.id) || downloadState.status === 'downloaded'));
  const isDownloading = downloadState.status === 'downloading';

  const handleOfflineAction = () => {
    if (!currentItem || isDownloaded || isDownloading) return;
    const playback = source || currentItem.playback;
    if (!playback) return;
    const downloadablePlayback: PlaybackSource = {
      ...playback,
      kind: 'direct',
      downloadable: true,
      url: playback.downloadUrl || playback.url,
      downloadUrl: playback.downloadUrl || playback.url,
    };
    void startVideoDownload(currentItem, downloadablePlayback);
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const episodesRef = useRef<HTMLElement | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchAppliedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number; initialVol: number; initialBright: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<'brightness' | 'volume' | null>(null);
  const seekHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekHoldRef = useRef({ active: false, resume: false });
  const episodeDetailsLoaderRef = useRef<(() => void) | null>(null);
  const episodeDetailsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrubbingRef = useRef(false);
  const keyboardActionsRef = useRef<{
    toggleFullscreen?: () => void;
    animatedTogglePlay?: () => void;
    seekBy?: (delta: number) => void;
    minimize?: () => void;
    adjustVolume?: (delta: number) => void;
    toggleMute?: () => void;
    isExpanded?: boolean;
    isBrowserFullscreen?: boolean;
  }>({});
  const currentId = currentItem?.id || null;

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled);
  }, []);

  const releaseHeldSeek = (video: HTMLVideoElement) => {
    if (!seekHoldRef.current.active) return;
    const resume = seekHoldRef.current.resume;
    seekHoldRef.current = { active: false, resume: false };
    if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
    seekHoldTimerRef.current = null;
    if (resume) video.play().catch(() => undefined);
  };

  const seekDirectly = useCallback((seconds: number) => {
    const video = videoRef.current;
    const safeTarget = Math.max(0, Math.min(seconds, duration || seconds));
    if (source?.kind === 'direct' && video) {
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad(safeTarget);
        } catch {}
      }
      if (typeof (video as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek === 'function') {
        try {
          (video as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek!(safeTarget);
        } catch {
          video.currentTime = safeTarget;
        }
      } else {
        video.currentTime = safeTarget;
      }
      reportPlayback({ currentTime: safeTarget, forceTimeUpdate: true });
      if (currentItem) {
        updateWatchProgress(currentItem.id, safeTarget, video.duration || currentItem.durationSeconds, true);
      }
    } else if (source?.kind === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.seekTo(safeTarget, true);
      reportPlayback({ currentTime: safeTarget, forceTimeUpdate: true });
      if (currentItem) {
        updateWatchProgress(currentItem.id, safeTarget, duration, true);
      }
    } else {
      seek(safeTarget);
    }
  }, [currentItem, duration, reportPlayback, seek, source?.kind, updateWatchProgress]);

  const syncWithTime = useCallback((targetSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const safeTarget = Math.max(0, Math.min(targetSeconds, duration || targetSeconds));
    const diff = safeTarget - video.currentTime;

    // Drift < 0.2s: already in sync
    if (Math.abs(diff) < 0.2) return;

    // Smooth compensation for micro-drift between 0.2s and 1.75s
    if (Math.abs(diff) <= 1.75) {
      if (driftCompensationTimerRef.current) clearTimeout(driftCompensationTimerRef.current);
      const baseSpeed = playbackSpeedRef.current || 1;
      const targetSpeed = diff > 0 ? Math.min(baseSpeed * 1.08, 2.0) : Math.max(baseSpeed * 0.92, 0.5);
      video.playbackRate = targetSpeed;
      driftCompensationTimerRef.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.playbackRate = playbackSpeedRef.current || 1;
        }
      }, Math.min(Math.abs(diff) * 1000 * 8, 2500));
    } else {
      // Large drift: direct seek
      seekDirectly(safeTarget);
    }
  }, [duration, seekDirectly]);

  useEffect(() => {
    if (!currentItem || currentItem.mediaType !== 'tv') {
      setPlayerEpisodes([]);
      setEpisodesLoading(false);
      setEpisodeError(null);
      return;
    }
    const season = currentItem.selectedSeason || currentItem.seasons?.[0]?.number || 1;
    const episodes = currentItem.episodes || [];
    setEpisodeSeason(season);
    setPlayerEpisodes(episodes);
    if (currentItem.episodes) setEpisodesLoading(false);
    setEpisodeError(null);
    if (episodes.length) {
      replaceQueue(buildEpisodeQueue(currentItem, episodes, season), currentItem.id);
    }
  }, [currentItem, replaceQueue]);

  useEffect(() => {
    if (!currentItem) {
      setRelatedItems([]);
      return;
    }
    if (currentItem.related && currentItem.related.length > 0) {
      setRelatedItems(currentItem.related);
      return;
    }
    let active = true;
    fetch(`/api/related?id=${encodeURIComponent(currentItem.id)}&type=${currentItem.mediaType}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data.results)) {
          setRelatedItems(data.results);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [currentItem?.id, currentItem?.mediaType, currentItem?.related]);

  useEffect(() => {
    if (!currentItem) {
      setSource(null);
      setDirectUrl(null);
      return;
    }

    // Immediately teardown previous video & HLS stream for fast one-click video change
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    wasPausedRef.current = false;
    setSource(null);
    setDirectUrl(null);

    let active = true;
    const itemAtStart = currentItem;
    const applySource = async (playback: PlaybackSource | null | undefined) => {
      if (!active) return;
      if (!playback) {
        setSource(null);
        setDirectUrl(null);
        reportPlayback({ isLoading: false, isPlaying: false, error: 'No playable source is currently available.' });
        return;
      }
      setSource(playback);
      if (playback.kind === 'direct' && playback.url) {
        const local = await isVideoDownloaded(itemAtStart.id)
          ? await getOfflinePlaybackUrl(itemAtStart.id)
          : null;
        if (active) setDirectUrl(local || playback.url);
      } else {
        setDirectUrl(null);
      }
    };

    reportPlayback({ isLoading: true, isPlaying: false, error: null, currentTime: 0 });
    const isNetMirror = itemAtStart.id.startsWith('netmirror-');
    const isFreshNetMirrorPlayback = Boolean(
      itemAtStart.playback?.resolvedAt
      && Date.now() - itemAtStart.playback.resolvedAt < 2 * 60 * 1000,
    );
    const canReusePlayback = Boolean(itemAtStart.playback) && (
      !isNetMirror
      || isFreshNetMirrorPlayback
      || !navigator.onLine
    );
    let resolveUrl = `/api/title?type=${itemAtStart.mediaType}&id=${encodeURIComponent(itemAtStart.providerId)}`;
    if (isNetMirror) {
      const params = new URLSearchParams({
        id: itemAtStart.providerId,
        title: itemAtStart.title,
        type: itemAtStart.mediaType,
        year: itemAtStart.year,
      });
      if (itemAtStart.selectedSeason) params.set('season', String(itemAtStart.selectedSeason));
      if (itemAtStart.selectedEpisode) params.set('episode', String(itemAtStart.selectedEpisode));
      resolveUrl = `/api/netmirror/title?${params.toString()}`;
    }
    const needsEpisodeDetails = isNetMirror && itemAtStart.mediaType === 'tv' && !itemAtStart.episodes;
    if (needsEpisodeDetails) {
      setEpisodesLoading(true);
      setEpisodeError(null);
    }
    const loadEpisodeDetails = async () => {
      if (!needsEpisodeDetails) return;
      try {
        const response = await fetch(resolveUrl);
        const payload = await response.json() as MediaDetails & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Could not load episodes.');
        if (active) resolveCurrentItem(payload);
      } catch (error) {
        if (active) setEpisodeError(error instanceof Error ? error.message : 'Could not load episodes.');
      } finally {
        if (active) setEpisodesLoading(false);
      }
    };
    let episodeDetailsStarted = false;
    const queueEpisodeDetails = () => {
      if (!needsEpisodeDetails) return;
      const start = () => {
        if (!active || episodeDetailsStarted) return;
        episodeDetailsStarted = true;
        episodeDetailsLoaderRef.current = null;
        if (episodeDetailsTimerRef.current) clearTimeout(episodeDetailsTimerRef.current);
        episodeDetailsTimerRef.current = null;
        void loadEpisodeDetails();
      };
      episodeDetailsLoaderRef.current = start;
      episodeDetailsTimerRef.current = setTimeout(start, 6000);
    };

    if (canReusePlayback) {
      queueEpisodeDetails();
      void applySource(itemAtStart.playback);
    } else {
      const playbackRequest = isNetMirror
        ? resolveNetMirrorPlayback(itemAtStart)
        : fetch(resolveUrl).then(async (response) => {
            const payload = await response.json() as MediaDetails & { error?: string };
            if (!response.ok) throw new Error(payload.error || 'Could not resolve playback.');
            return payload;
          });
      playbackRequest
        .then(async (details) => {
          if (!active) return;
          const playableDetails = itemAtStart.mediaType === 'tv'
            ? {
                ...details,
                seasons: details.seasons || itemAtStart.seasons,
                episodes: details.episodes || itemAtStart.episodes,
                seasonCount: details.seasonCount || itemAtStart.seasonCount,
                episodeCount: details.episodeCount || itemAtStart.episodeCount,
              }
            : details;
          resolveCurrentItem(playableDetails);
          queueEpisodeDetails();
          await applySource(playableDetails.playback);
        })
        .catch((error) => {
          if (!active) return;
          setSource(null);
          reportPlayback({
            isLoading: false,
            isPlaying: false,
            error: error instanceof Error ? error.message : 'Could not resolve playback.',
          });
        });
    }

    return () => {
      active = false;
      episodeDetailsLoaderRef.current = null;
      if (episodeDetailsTimerRef.current) clearTimeout(episodeDetailsTimerRef.current);
      episodeDetailsTimerRef.current = null;
    };
  }, [currentId]);

  useEffect(() => {
    setSelectedQuality(source?.selectedQuality || source?.label || 'Auto');
    setSelectedAudio(source?.selectedAudio || 'Original');
    setSelectedSubtitle((current) => source?.subtitles?.some((track) => track.id === current) ? current : 'off');
    setPlayerMenu(null);
  }, [source]);

  useEffect(() => {
    setVideoFit('contain');
    setFitFeedback(null);
    setIsLocked(false);
    setShowUnlockBanner(false);
    seekHoldRef.current = { active: false, resume: false };
    if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
    seekHoldTimerRef.current = null;
  }, [currentId]);

  const revealControls = () => {
    if (isLocked) return;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isPlaying && !playerMenu && !isScrubbingRef.current) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3500);
    }
  };

  useEffect(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!isLocked) setShowControls(true);
    if (isPlaying && isExpanded && !isLocked && !playerMenu && !isScrubbingRef.current) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3500);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isPlaying, isExpanded, currentId, isLocked, playerMenu]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      const tracks = Array.from(video.textTracks || []);
      tracks.forEach((track, index) => {
        const configured = source?.subtitles?.[index];
        track.mode = configured?.id === selectedSubtitle ? 'showing' : 'disabled';
      });
    };
    apply();
    video.addEventListener('loadedmetadata', apply);
    return () => video.removeEventListener('loadedmetadata', apply);
  }, [selectedSubtitle, source?.subtitles, directUrl]);

  useEffect(() => {
    if (source?.kind !== 'direct' || !directUrl || !videoRef.current || !currentItem) return;
    const video = videoRef.current;
    const rootKey = journeyKey(currentItem);
    const resumeAt = pendingSeekRef.current ?? watchProgress[currentItem.id]?.position ?? watchProgress[rootKey]?.position ?? 0;
    const isHls = Boolean(directUrl && (directUrl.includes('.m3u8') || source?.mimeType?.includes('mpegurl')));
    let hlsInstance: Hls | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const fallBackQuality = () => {
      if (directUrl.startsWith('blob:')) return false;
      const currentResolution = Number.parseInt(selectedQuality, 10) || Number.MAX_SAFE_INTEGER;
      const lower = (source.qualities || [])
        .map((quality) => ({ ...quality, resolution: Number.parseInt(quality.label, 10) || 0 }))
        .filter((quality) => quality.resolution > 0 && quality.resolution < currentResolution && quality.url !== directUrl)
        .sort((left, right) => right.resolution - left.resolution)[0];
      if (!lower) return false;
      pendingSeekRef.current = video.currentTime || currentTime;
      setSelectedQuality(lower.label);
      setDirectUrl(lower.url);
      reportPlayback({ isLoading: true, error: null });
      return true;
    };

    const onLoaded = () => {
      if (resumeAt > 2 && resumeAt < video.duration - 5) video.currentTime = resumeAt;
      pendingSeekRef.current = null;
      reportPlayback({ duration: video.duration || currentItem.durationSeconds, isLoading: false, error: null });
      video.volume = volume;
      video.playbackRate = playbackSpeed;

      if (wasPausedRef.current) {
        video.pause();
        reportPlayback({ isPlaying: false, isLoading: false });
      } else {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => reportPlayback({ isPlaying: true, isLoading: false }))
            .catch(() => {
              if (!video.muted) {
                video.muted = true;
                video.play()
                  .then(() => reportPlayback({ isPlaying: true, isLoading: false }))
                  .catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
              } else {
                reportPlayback({ isPlaying: false, isLoading: false });
              }
            });
        }
      }
      episodeDetailsLoaderRef.current?.();
    };

    if (isHls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        startPosition: resumeAt > 2 ? resumeAt : -1,
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
        maxBufferSize: 60 * 1024 * 1024,
        backBufferLength: 40,
        maxBufferHole: 0.5,
        startFragPrefetch: true,
        progressive: true,
      });
      hlsRef.current = hlsInstance;
      hlsInstance.attachMedia(video);
      hlsInstance.loadSource(directUrl);

      hlsInstance.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCountRef.current = 0;
        mediaRetryCountRef.current = 0;
        if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
      });

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (resumeAt > 2 && Math.abs(video.currentTime - resumeAt) > 1 && resumeAt < (video.duration || currentItem.durationSeconds) - 5) {
          video.currentTime = resumeAt;
        }
        pendingSeekRef.current = null;
        reportPlayback({ duration: video.duration || currentItem.durationSeconds, isLoading: false, error: null });
        video.volume = volume;
        video.playbackRate = playbackSpeed;
        episodeDetailsLoaderRef.current?.();

        if (wasPausedRef.current) {
          video.pause();
          intendedPlayingRef.current = false;
          reportPlayback({ isPlaying: false, isLoading: false });
        } else {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                intendedPlayingRef.current = true;
                reportPlayback({ isPlaying: true, isLoading: false });
              })
              .catch(() => {
                if (!video.muted) {
                  video.muted = true;
                  video.play()
                    .then(() => {
                      intendedPlayingRef.current = true;
                      reportPlayback({ isPlaying: true, isLoading: false });
                    })
                    .catch(() => {
                      intendedPlayingRef.current = false;
                      reportPlayback({ isPlaying: false, isLoading: false });
                    });
                } else {
                  intendedPlayingRef.current = false;
                  reportPlayback({ isPlaying: false, isLoading: false });
                }
              });
          }
        }

        if (data.levels && data.levels.length > 1) {
          const parsed = data.levels.map((lvl, index) => ({
            id: index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
          })).sort((a, b) => b.height - a.height);
          setHlsLevels(parsed);

          if (selectedQualityRef.current && selectedQualityRef.current !== 'Auto') {
            const targetHeight = Number.parseInt(selectedQualityRef.current, 10);
            const matchIdx = data.levels.findIndex((lvl) => lvl.height === targetHeight || lvl.name === selectedQualityRef.current);
            if (matchIdx !== -1 && hlsInstance) {
              hlsInstance.currentLevel = matchIdx;
              hlsInstance.nextLevel = matchIdx;
            }
          }
        } else {
          setHlsLevels([]);
        }

        const rawAudio = hlsInstance?.audioTracks || [];
        if (rawAudio.length > 1) {
          setHlsAudioTracks(rawAudio.map((track, index) => ({
            id: index,
            label: track.name || track.lang || `Track ${index + 1}`,
          })));
          const defIdx = rawAudio.findIndex((t) => t.default);
          const activeTrack = defIdx >= 0 ? rawAudio[defIdx] : rawAudio[0];
          if (activeTrack) {
            setSelectedAudio(activeTrack.name || activeTrack.lang || 'Original');
          }
        } else {
          setHlsAudioTracks([]);
        }
      });

      hlsInstance.on(Hls.Events.LEVELS_UPDATED, (_event, data) => {
        if (data.levels && data.levels.length > 1) {
          const parsed = data.levels.map((lvl, index) => ({
            id: index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
          })).sort((a, b) => b.height - a.height);
          setHlsLevels(parsed);
        }
      });

      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        const currentTracks = hlsInstance?.audioTracks || [];
        const track = currentTracks[data.id];
        if (track) {
          setSelectedAudio(track.name || track.lang || `Track ${data.id + 1}`);
        }
      });

      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setIsBuffering(false);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (networkRetryCountRef.current < 5) {
            const attempt = networkRetryCountRef.current + 1;
            networkRetryCountRef.current = attempt;
            const delay = Math.min(500 * Math.pow(1.6, attempt - 1), 5000);
            if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
            networkRetryTimerRef.current = setTimeout(() => {
              if (hlsRef.current) {
                hlsRef.current.startLoad();
              }
            }, delay);
          } else {
            reportPlayback({ isLoading: false, isPlaying: false, error: 'Network error encountered. Unable to stream.' });
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRetryCountRef.current === 0) {
            mediaRetryCountRef.current = 1;
            hlsInstance?.recoverMediaError();
          } else if (mediaRetryCountRef.current === 1) {
            mediaRetryCountRef.current = 2;
            hlsInstance?.swapAudioCodec();
            hlsInstance?.recoverMediaError();
          } else {
            if (hlsInstance && hlsInstance.currentLevel > 0) {
              hlsInstance.currentLevel = hlsInstance.currentLevel - 1;
              hlsInstance.recoverMediaError();
            } else if (!fallBackQuality()) {
              reportPlayback({ isLoading: false, isPlaying: false, error: 'This stream could not be decoded.' });
            }
          }
        } else {
          reportPlayback({ isLoading: false, isPlaying: false, error: 'This stream could not be played.' });
        }
      });
    }

    const onTime = () => {
      reportPlayback({ currentTime: video.currentTime, duration: video.duration || currentItem.durationSeconds });
      updateWatchProgress(currentItem.id, video.currentTime, video.duration || currentItem.durationSeconds);
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onPlay = () => {
      intendedPlayingRef.current = true;
      video.muted = volume === 0;
      video.volume = volume;
      video.playbackRate = playbackSpeed;
      reportPlayback({ isPlaying: true, isLoading: false, error: null });
    };
    const onPause = () => {
      intendedPlayingRef.current = false;
      setIsBuffering(false);
      reportPlayback({ isPlaying: false, isLoading: false, forceTimeUpdate: true });
      updateWatchProgress(currentItem.id, video.currentTime, video.duration || currentItem.durationSeconds, true);
    };
    const onWaiting = () => {
      if (seekHoldRef.current.active) return;
      setIsBuffering(true);
      reportPlayback({ isLoading: true });
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (video.readyState < 3 && !video.paused) {
          if (hlsRef.current) {
            try {
              hlsRef.current.startLoad();
            } catch {
              try {
                hlsRef.current.recoverMediaError();
              } catch {}
            }
          } else {
            try {
              video.currentTime = video.currentTime + 0.01;
            } catch {}
          }
        }
      }, 3000);
    };
    const onPlaying = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      setIsBuffering(false);
      networkRetryCountRef.current = 0;
      mediaRetryCountRef.current = 0;
      nativeRetryCountRef.current = 0;
      intendedPlayingRef.current = true;
      reportPlayback({ isPlaying: true, isLoading: false, error: null });
    };
    const onSeeking = () => {
      reportPlayback({ isLoading: true });
    };
    const onCanPlay = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      setIsBuffering(false);
      reportPlayback({ isLoading: false, error: null });
      if (intendedPlayingRef.current && video.paused) {
        video.play().catch(() => undefined);
      }
    };
    const onSeeked = () => {
      if (!seekHoldRef.current.active) return;
      requestAnimationFrame(() => requestAnimationFrame(() => releaseHeldSeek(video)));
    };
    const onError = () => {
      if (!directUrl || !video.src) return;
      setIsBuffering(false);
      const mediaErr = video.error;
      if (mediaErr && (mediaErr.code === 2 || mediaErr.code === 3)) {
        if (nativeRetryCountRef.current < 3) {
          nativeRetryCountRef.current += 1;
          const resumeTime = video.currentTime || 0;
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.src = directUrl;
              videoRef.current.load();
              if (resumeTime > 0) videoRef.current.currentTime = resumeTime;
              videoRef.current.play().catch(() => undefined);
            }
          }, 1000 * nativeRetryCountRef.current);
          return;
        }
      }
      if (!fallBackQuality()) reportPlayback({ isLoading: false, isPlaying: false, error: 'This video could not be played.' });
    };

    if (!isHls) {
      video.addEventListener('loadedmetadata', onLoaded);
    }
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', onError);

    if (!isHls || (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl'))) {
      if (video.src !== directUrl) {
        video.src = directUrl;
      }
      if (video.readyState >= 1) {
        onLoaded();
      }
    }

    const controller: PlaybackController = {
      play: () => {
        intendedPlayingRef.current = true;
        video.play().catch(() => undefined);
      },
      pause: () => {
        intendedPlayingRef.current = false;
        video.pause();
      },
      seek: (seconds) => {
        seekDirectly(seconds);
      },
      syncWithTime: (seconds) => {
        syncWithTime(seconds);
      },
      setVolume: (nextVolume) => {
        video.volume = nextVolume;
      },
    };
    registerController(controller);

    return () => {
      if (!isHls) {
        video.removeEventListener('loadedmetadata', onLoaded);
      }
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', onError);
      if (stallTimer) clearTimeout(stallTimer);
      if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
      if (driftCompensationTimerRef.current) clearTimeout(driftCompensationTimerRef.current);
      if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
      seekHoldTimerRef.current = null;
      seekHoldRef.current = { active: false, resume: false };
      video.pause();
      hlsRef.current = null;
      setHlsLevels([]);
      setHlsAudioTracks([]);
      hlsInstance?.destroy();
      registerController(null);
    };
  }, [source, directUrl, currentId, handleEnded, registerController, reportPlayback, updateWatchProgress, syncWithTime, seekDirectly]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = volume === 0;
    }
  }, [volume]);

  useEffect(() => {
    if (source?.kind !== 'youtube' || !source.videoId || !youtubeContainerRef.current || !currentItem) return;
    let active = true;
    const itemAtStart = currentItem;
    const rootKey = journeyKey(itemAtStart);
    const resumeAt = watchProgress[itemAtStart.id]?.position ?? watchProgress[rootKey]?.position ?? 0;

    loadYouTubeApi().then((YT) => {
      if (!active || !youtubeContainerRef.current) return;
      youtubePlayerRef.current = new YT.Player(youtubeContainerRef.current, {
        videoId: source.videoId!,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          modestbranding: 1,
        },
        events: {
          onReady: ({ target }) => {
            if (!active) return;
            try {
              target.setVolume(volume * 100);
              if (resumeAt > 2) target.seekTo(resumeAt, true);
              target.playVideo();
            } catch {}
            reportPlayback({ isLoading: false, error: null });
          },
          onStateChange: ({ data, target }) => {
            if (!active) return;
            if (data === 1) reportPlayback({ isPlaying: true, isLoading: false });
            if (data === 2) reportPlayback({ isPlaying: false, isLoading: false });
            if (data === 3) reportPlayback({ isLoading: true });
            if (data === 0) handleEnded();
            try {
              const total = target.getDuration() || itemAtStart.durationSeconds;
              if (total) reportPlayback({ duration: total });
            } catch {}
          },
          onError: () => reportPlayback({ isPlaying: false, isLoading: false, error: 'The official trailer is restricted from embedded playback.' }),
        },
      });

      const controller: PlaybackController = {
        play: () => { try { youtubePlayerRef.current?.playVideo(); } catch {} },
        pause: () => { try { youtubePlayerRef.current?.pauseVideo(); } catch {} },
        seek: (seconds) => { try { youtubePlayerRef.current?.seekTo(seconds, true); } catch {} },
        setVolume: (nextVolume) => { try { youtubePlayerRef.current?.setVolume(nextVolume * 100); } catch {} },
      };
      registerController(controller);

      youtubeTickerRef.current = setInterval(() => {
        const player = youtubePlayerRef.current;
        if (!player || !active) return;
        const position = player.getCurrentTime() || 0;
        const total = player.getDuration() || itemAtStart.durationSeconds;
        reportPlayback({ currentTime: position, duration: total });
        updateWatchProgress(itemAtStart.id, position, total);
      }, 750);
    }).catch((error) => {
      if (active) reportPlayback({ isLoading: false, isPlaying: false, error: error instanceof Error ? error.message : 'Could not load trailer player.' });
    });

    return () => {
      active = false;
      if (youtubeTickerRef.current) clearInterval(youtubeTickerRef.current);
      youtubeTickerRef.current = null;
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
      registerController(null);
    };
  }, [source, currentId, handleEnded, registerController, reportPlayback, updateWatchProgress]);

  useEffect(() => {
    if (!isExpanded && source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
  }, [isExpanded, source]);

  useEffect(() => {
    const updateOrientation = () => {
      if (typeof window === 'undefined') return;
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    try {
      screen.orientation?.addEventListener?.('change', updateOrientation);
    } catch {}

    const onFullscreen = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        mozFullScreenElement?: Element;
        msFullscreenElement?: Element;
      };
      const active = Boolean(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );
      setIsBrowserFullscreen(active);
      updateOrientation();
      if (active) {
        void lockScreenOrientation();
      } else {
        unlockScreenOrientation();
      }
      revealControls();
    };

    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    document.addEventListener('mozfullscreenchange', onFullscreen);
    document.addEventListener('MSFullscreenChange', onFullscreen);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      try {
        screen.orientation?.removeEventListener?.('change', updateOrientation);
      } catch {}
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      document.removeEventListener('mozfullscreenchange', onFullscreen);
      document.removeEventListener('MSFullscreenChange', onFullscreen);
    };
  }, []);

  useEffect(() => {
    const handleOrientationOrResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth > window.innerHeight) {
        setPlayerMenu(null);
        revealControls();
      }
    };

    window.addEventListener('orientationchange', handleOrientationOrResize);
    window.addEventListener('resize', handleOrientationOrResize);
    try {
      screen.orientation?.addEventListener?.('change', handleOrientationOrResize);
    } catch {}

    return () => {
      window.removeEventListener('orientationchange', handleOrientationOrResize);
      window.removeEventListener('resize', handleOrientationOrResize);
      try {
        screen.orientation?.removeEventListener?.('change', handleOrientationOrResize);
      } catch {}
    };
  }, []);

  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
    seekHoldRef.current = { active: false, resume: false };
    if (episodeDetailsTimerRef.current) clearTimeout(episodeDetailsTimerRef.current);
    episodeDetailsLoaderRef.current = null;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const actions = keyboardActionsRef.current;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!actions.isExpanded) {
          setIsExpanded(true);
          setTimeout(() => {
            actions.toggleFullscreen?.();
          }, 60);
        } else {
          actions.toggleFullscreen?.();
        }
      } else if (e.key === ' ' || e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        actions.animatedTogglePlay?.();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        actions.seekBy?.(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        actions.seekBy?.(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        actions.adjustVolume?.(0.1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        actions.adjustVolume?.(-0.1);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        actions.toggleMute?.();
      } else if (e.key === 'Escape' && actions.isExpanded && !actions.isBrowserFullscreen) {
        e.preventDefault();
        actions.minimize?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsExpanded]);

  if (!currentItem) {
    keyboardActionsRef.current = {};
    return null;
  }

  const saved = isWatchlisted(currentItem.id);
  const background = currentItem.backdropUrl || currentItem.posterUrl;
  const isSeries = currentItem.mediaType === 'tv';
  const episodesPending = isSeries && (episodesLoading || (!currentItem.episodes && !episodeError));
  const currentEpNum = currentItem.selectedEpisode || 1;
  const nextEpisode = playerEpisodes.find((ep) => ep.number === currentEpNum + 1);
  const isEnded = duration > 0 && ((videoRef.current?.currentTime ?? currentTime) >= duration - 0.5);

  const chooseSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setPlayerMenu(null);
    revealControls();
  };

  const cycleSpeed = () => {
    const currentIdx = SPEED_OPTIONS.indexOf(playbackSpeed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    chooseSpeed(SPEED_OPTIONS[nextIdx]);
  };

  const chooseQuality = useCallback((label: string, url?: string, hlsLevelIndex?: number) => {
    setSelectedQuality(label);
    selectedQualityRef.current = label;
    setPlayerMenu(null);
    revealControls();

    const video = videoRef.current;
    const wasPaused = video ? video.paused : !isPlaying;
    wasPausedRef.current = wasPaused;
    const currentPos = video?.currentTime ?? currentTime;

    if (hlsRef.current) {
      const hls = hlsRef.current;
      const levels = hls.levels || [];

      if (label === 'Auto' || hlsLevelIndex === -1) {
        hls.currentLevel = -1;
        hls.nextLevel = -1;
        return;
      }

      if (typeof hlsLevelIndex === 'number' && hlsLevelIndex >= 0 && hlsLevelIndex < levels.length) {
        hls.currentLevel = hlsLevelIndex;
        hls.nextLevel = hlsLevelIndex;
        return;
      }

      if (levels.length > 0) {
        const targetHeight = Number.parseInt(label, 10);
        const matchIdx = levels.findIndex((lvl) => lvl.height === targetHeight || lvl.name === label);
        if (matchIdx !== -1) {
          hls.currentLevel = matchIdx;
          hls.nextLevel = matchIdx;
          return;
        }
      }

      console.warn(`[QualitySelector] Level "${label}" not found. Falling back to Auto.`);
      hls.currentLevel = -1;
      hls.nextLevel = -1;
      return;
    }

    if (url && url !== directUrl) {
      pendingSeekRef.current = currentPos;
      setDirectUrl(url);
      reportPlayback({ isLoading: true });
    }
  }, [currentTime, directUrl, isPlaying, reportPlayback, revealControls]);

  const chooseAudio = async (resolveUrl: string) => {
    setSwitchingSource(true);
    setPlayerMenu(null);
    const video = videoRef.current;
    wasPausedRef.current = video ? video.paused : !isPlaying;
    pendingSeekRef.current = video?.currentTime ?? currentTime;
    try {
      const response = await fetch(resolveUrl);
      const payload = await response.json() as MediaDetails & { error?: string };
      if (!response.ok || !payload.playback?.url) throw new Error(payload.error || 'Audio track is unavailable.');
      const matchingQuality = payload.playback.qualities?.find((quality) => quality.label === selectedQuality);
      const playback = matchingQuality
        ? { ...payload.playback, url: matchingQuality.url, selectedQuality: matchingQuality.label }
        : payload.playback;
      setSource(playback);
      setDirectUrl(playback.url!);
      reportPlayback({ error: null, isLoading: true });
    } catch (error) {
      pendingSeekRef.current = null;
      reportPlayback({
        error: error instanceof Error ? error.message : 'Audio track is unavailable.',
        isLoading: false,
      });
    } finally {
      setSwitchingSource(false);
    }
  };

  const loadPlayerSeason = async (season: number) => {
    setEpisodeSeason(season);
    setEpisodesLoading(true);
    setEpisodeError(null);
    try {
      if (!currentItem.catalogId) throw new Error('Season information is unavailable.');
      const response = await fetch(`/api/netmirror/season?catalogId=${currentItem.catalogId}&season=${season}`);
      const payload = await response.json() as { episodes?: MediaEpisode[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not load this season.');
      setPlayerEpisodes(payload.episodes || []);
    } catch (error) {
      setPlayerEpisodes([]);
      setEpisodeError(error instanceof Error ? error.message : 'Could not load this season.');
    } finally {
      setEpisodesLoading(false);
    }
  };

  const playPlayerEpisode = async (episode: MediaEpisode) => {
    if (currentItem.selectedSeason === episodeSeason && currentItem.selectedEpisode === episode.number) {
      seek(0);
      return;
    }
    setSwitchingEpisode(episode.number);
    setEpisodeError(null);
    try {
      const params = new URLSearchParams({
        id: currentItem.providerId,
        title: seriesTitle(currentItem.title),
        type: 'tv',
        year: currentItem.year,
        season: String(episodeSeason),
        episode: String(episode.number),
        playbackOnly: '1',
      });
      const response = await fetch(`/api/netmirror/title?${params.toString()}`);
      const payload = await response.json() as MediaDetails & { error?: string };
      if (!response.ok || !payload.playback?.url) {
        throw new Error(payload.error || 'Could not play this episode.');
      }
      const playableEpisode: MediaDetails = {
        ...payload,
        title: `${seriesTitle(currentItem.title)} • S${episodeSeason} E${episode.number}${episode.name ? ` — ${episode.name}` : ''}`,
        overview: episode.overview || currentItem.overview,
        posterUrl: payload.posterUrl || currentItem.posterUrl,
        backdropUrl: episode.stillUrl || currentItem.backdropUrl,
        genres: currentItem.genres || [],
        durationSeconds: episode.runtimeMinutes * 60,
        language: currentItem.language,
        seasonCount: currentItem.seasonCount,
        episodeCount: currentItem.episodeCount,
        seasons: currentItem.seasons,
        episodes: playerEpisodes,
        related: [],
      };
      playItem(playableEpisode, buildEpisodeQueue(playableEpisode, playerEpisodes, episodeSeason));
    } catch (error) {
      setEpisodeError(error instanceof Error ? error.message : 'Could not play this episode.');
    } finally {
      setSwitchingEpisode(null);
    }
  };

  const playNextEpisode = () => {
    if (nextEpisode) {
      void playPlayerEpisode(nextEpisode);
    } else {
      nextItem();
    }
  };

  const animatedTogglePlay = () => {
    if (isEnded) {
      seekDirectly(0);
      return;
    }
    const video = videoRef.current;
    if (video && source?.kind === 'direct') {
      if (video.paused) {
        setControlPulse('play');
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => reportPlayback({ isPlaying: true, isLoading: false }))
            .catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
        } else {
          reportPlayback({ isPlaying: true, isLoading: false });
        }
      } else {
        setControlPulse('pause');
        video.pause();
        reportPlayback({ isPlaying: false, isLoading: false });
      }
    } else if (source?.kind === 'youtube' && youtubePlayerRef.current) {
      try {
        const yt = youtubePlayerRef.current;
        const state = typeof yt.getPlayerState === 'function' ? yt.getPlayerState() : (isPlaying ? 1 : 2);
        if (state === 1) {
          setControlPulse('pause');
          yt.pauseVideo();
          reportPlayback({ isPlaying: false, isLoading: false });
        } else {
          setControlPulse('play');
          yt.playVideo();
          reportPlayback({ isPlaying: true, isLoading: false });
        }
      } catch {
        togglePlay();
      }
    } else {
      togglePlay();
    }
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setControlPulse(null), 400);
    revealControls();
  };

  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  };

  const applyVideoFit = (fit: 'contain' | 'cover' | 'fill') => {
    setVideoFit(fit);
    setFitFeedback(fit === 'cover' ? 'Fill' : fit === 'fill' ? 'Stretch' : 'Fit');
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => setFitFeedback(null), 1000);
  };

  const seekBy = (deltaSeconds: number) => {
    const current = videoRef.current?.currentTime ?? currentTime;
    const target = Math.max(0, Math.min(current + deltaSeconds, duration || current + deltaSeconds));
    seekDirectly(target);
    revealControls();
  };

  const handleStageTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // Don't hijack touches when menu is open or touch starts inside settings/controls menu
    if (playerMenu || (event.target as HTMLElement).closest('.player-controls-menu')) return;
    if (event.touches.length === 2) {
      pinchDistanceRef.current = touchDistance(event.touches);
      pinchAppliedRef.current = false;
      return;
    }
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        initialVol: volume,
        initialBright: brightness,
      };
      isDraggingRef.current = false;
      dragModeRef.current = null;
    }
  };

  const handleStageTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    // Don't interfere with scrolling/tapping inside the settings menu or when menu is open
    if (playerMenu || (event.target as HTMLElement).closest('.player-controls-menu')) return;

    // 2-finger pinch
    if (event.touches.length === 2 && pinchDistanceRef.current && !pinchAppliedRef.current) {
      const dist = touchDistance(event.touches);
      const ratio = dist / pinchDistanceRef.current;
      if (ratio > 1.15) {
        applyVideoFit('cover');
        pinchAppliedRef.current = true;
      } else if (ratio < 0.85) {
        applyVideoFit('contain');
        pinchAppliedRef.current = true;
      }
      return;
    }

    // 1-finger vertical gestures (left: brightness, right: volume)
    if (event.touches.length === 1 && touchStartRef.current && !isLocked) {
      const touch = event.touches[0];
      const start = touchStartRef.current;
      const isRotated = isBrowserFullscreen && isPortrait;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const stage = stageRef.current;
      const height = stage?.clientHeight || 400;

      const mainDelta = isRotated ? -dx : -dy;
      const crossDelta = isRotated ? Math.abs(dy) : Math.abs(dx);

      if (!isDraggingRef.current && Math.abs(mainDelta) > 16 && Math.abs(mainDelta) > crossDelta) {
        isDraggingRef.current = true;
        const width = stage?.clientWidth || 600;
        const rect = stage?.getBoundingClientRect();
        if (isRotated) {
          const touchY = rect ? touch.clientY - rect.top : start.y;
          dragModeRef.current = touchY < height / 2 ? 'volume' : 'brightness';
        } else {
          const touchX = rect ? touch.clientX - rect.left : start.x;
          dragModeRef.current = touchX < width / 2 ? 'brightness' : 'volume';
        }
      }

      if (isDraggingRef.current && dragModeRef.current) {
        if (event.cancelable) event.preventDefault();
        const delta = (mainDelta / height) * 1.2;
        if (dragModeRef.current === 'brightness') {
          const nextBright = Math.max(0.2, Math.min(1.5, start.initialBright + delta));
          setBrightness(nextBright);
          setHudBrightness(nextBright);
          setHudVolume(null);
        } else if (dragModeRef.current === 'volume') {
          const nextVol = Math.max(0, Math.min(1, start.initialVol + delta));
          setVolume(nextVol);
          setHudVolume(nextVol);
          setHudBrightness(null);
        }
      }
    }
  };

  const handleStageTouchEnd = () => {
    // If menu was open, cancel any swipe drag that may have started before guard fired
    if (playerMenu) {
      touchStartRef.current = null;
      isDraggingRef.current = false;
      dragModeRef.current = null;
    }
    pinchDistanceRef.current = null;
    pinchAppliedRef.current = false;
    touchStartRef.current = null;
    isDraggingRef.current = false;
    dragModeRef.current = null;
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setHudBrightness(null);
      setHudVolume(null);
    }, 900);
  };

  const handleStageTap = (event: React.MouseEvent<HTMLDivElement>) => {
    // Always let clicks on interactive elements or inside the menu pass through
    if ((event.target as HTMLElement).closest('button,input,label,.player-controls-menu')) return;

    if (isLocked) {
      setShowUnlockBanner(true);
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = setTimeout(() => setShowUnlockBanner(false), 3500);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const side: 'left' | 'right' = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right';
    const now = event.timeStamp;
    const previous = lastTapRef.current;

    // Double tap seeking
    if (previous && previous.side === side && now - previous.at < 320) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      lastTapRef.current = null;
      const position = videoRef.current?.currentTime ?? currentTime;
      seekDirectly(position + (side === 'left' ? -10 : 10));
      setSeekFeedback(side);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 650);
      revealControls();
      return;
    }

    lastTapRef.current = { at: now, side };
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      lastTapRef.current = null;
      if (!showControls) revealControls();
      else {
        setShowControls(false);
        setPlayerMenu(null);
      }
    }, 330);
  };

  const share = () => {
    const url = `${window.location.origin}/?title=${encodeURIComponent(currentItem.title)}`;
    if (navigator.share) navigator.share({ title: currentItem.title, text: `Watch ${currentItem.title} on Co Stream`, url }).catch(() => undefined);
    else navigator.clipboard.writeText(url).catch(() => undefined);
  };

  const togglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Ignored
    }
  };

  const toggleFullscreen = async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
      mozFullScreenElement?: Element;
      mozCancelFullScreen?: () => void;
      msFullscreenElement?: Element;
      msExitFullscreen?: () => void;
    };
    const stageEl = stageRef.current as (HTMLElement & {
      webkitRequestFullscreen?: (options?: unknown) => Promise<void>;
      mozRequestFullScreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    }) | null;
    const isFs = Boolean(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      isBrowserFullscreen
    );

    revealControls();

    try {
      if (!isFs) {
        if (stageEl?.requestFullscreen) {
          await stageEl.requestFullscreen().catch(async () => {
            if (stageEl?.requestFullscreen) await stageEl.requestFullscreen();
          });
        } else if (stageEl?.webkitRequestFullscreen) {
          await stageEl.webkitRequestFullscreen();
        } else if (stageEl?.mozRequestFullScreen) {
          await stageEl.mozRequestFullScreen();
        } else if (stageEl?.msRequestFullscreen) {
          await stageEl.msRequestFullscreen();
        } else if (videoRef.current && (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
          (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
        }
        setIsBrowserFullscreen(true);
        void lockScreenOrientation();
      } else {
        unlockScreenOrientation();
        setIsBrowserFullscreen(false);
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => undefined);
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  const minimize = () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
      mozFullScreenElement?: Element;
      mozCancelFullScreen?: () => void;
      msFullscreenElement?: Element;
      msExitFullscreen?: () => void;
    };
    const isFs = Boolean(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      isBrowserFullscreen
    );

    if (isFs) {
      unlockScreenOrientation();
      setIsBrowserFullscreen(false);
      if (document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined);
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
      return;
    }

    if (source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
    setIsExpanded(false);
  };

  const adjustVolume = (delta: number) => {
    const next = Math.max(0, Math.min(1, Math.round((volume + delta) * 10) / 10));
    setVolume(next);
    setHudVolume(next);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVolume(null), 900);
  };

  const handleStageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (playerMenu || (event.target as HTMLElement).closest('.player-controls-menu')) return;
    if (isLocked) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    adjustVolume(delta);
    revealControls();
  };

  const toggleMute = () => {
    const next = volume > 0 ? 0 : 1;
    setVolume(next);
    setHudVolume(next);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVolume(null), 900);
  };

  keyboardActionsRef.current = {
    toggleFullscreen,
    animatedTogglePlay,
    seekBy,
    minimize,
    adjustVolume,
    toggleMute,
    isExpanded,
    isBrowserFullscreen,
  };

  const contextSubtitle = [
    isSeries && currentItem.selectedSeason ? `S${currentItem.selectedSeason} · E${currentItem.selectedEpisode || 1}` : null,
    source?.label || 'Co-Stream',
    selectedQuality !== 'Auto' ? selectedQuality : null,
  ].filter(Boolean).join(' • ');

  return (
    <>
      <div className={isExpanded ? 'watch-shell fixed inset-0 z-[70] overflow-y-auto no-scrollbar' : 'fixed -left-[9999px] top-0 w-80 h-48 opacity-0 pointer-events-none'}>
        {isExpanded && background && (
          <div className="watch-backdrop fixed inset-0 pointer-events-none">
            <Image src={background} alt="" fill sizes="100vw" priority className="watch-backdrop-image object-cover" />
            <div className="watch-backdrop-shade absolute inset-0 bg-black/85" />
          </div>
        )}

        <div className={isExpanded ? 'relative min-h-screen flex flex-col' : 'w-full h-full'}>
          <main className={isExpanded ? 'watch-main relative flex-1 w-full max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5' : 'w-full h-full'}>
            <div className="min-w-0 w-full h-full">
              <div
                ref={stageRef}
                onMouseMove={revealControls}
                onWheel={handleStageWheel}
                onTouchStart={handleStageTouchStart}
                onTouchMove={handleStageTouchMove}
                onTouchEnd={handleStageTouchEnd}
                onClick={handleStageTap}
                className={
                  isExpanded
                    ? `player-stage relative select-none touch-none ${
                        isBrowserFullscreen
                          ? `fixed inset-0 w-full h-full !aspect-auto !rounded-none !border-0 z-[100] ${
                              isPortrait ? 'fullscreen-portrait-rotated' : ''
                            }`
                          : 'aspect-video w-full rounded-2xl sm:rounded-[26px] overflow-hidden border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,.7)]'
                      } bg-black ${showControls ? 'cursor-default' : 'cursor-none'}`
                    : 'w-full h-full relative aspect-video bg-black'
                }
              >
                {/* ── Video Element ────────────────────────────────────────── */}
                {source?.kind === 'direct' && directUrl && (
                  <video
                    ref={videoRef}
                    key={currentItem.id}
                    src={isHls ? undefined : directUrl}
                    poster={currentItem.backdropUrl || currentItem.posterUrl || undefined}
                    playsInline
                    controls={false}
                    preload="metadata"
                    crossOrigin="anonymous"
                    style={{
                      filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
                    }}
                    className={`player-gpu-layer w-full h-full bg-black transition-[object-fit] duration-200 ${
                      videoFit === 'cover' ? 'object-cover' : videoFit === 'fill' ? 'object-fill' : 'object-contain'
                    }`}
                  >
                    {(source.subtitles || []).map((track) => (
                      <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />
                    ))}
                  </video>
                )}

                <BufferingOverlay isBuffering={isBuffering} />

                {source?.kind === 'youtube' && (
                  <div key={`${currentItem.id}-${source.videoId}`} ref={youtubeContainerRef} className="w-full h-full" />
                )}

                {!source && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
                    {isLoading ? (
                      <>
                        <span className="w-10 h-10 rounded-full border-3 border-[#7fffd2] border-t-transparent animate-spin" />
                        <p className="text-sm font-bold text-white/70">Preparing playback…</p>
                      </>
                    ) : playbackError ? (
                      <>
                        <span className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">🚫</span>
                        <div className="space-y-1.5 max-w-xs">
                          <p className="text-sm font-black text-white">Stream not available</p>
                          <p className="text-xs text-white/55 leading-5">{playbackError}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Play size={34} className="text-white/25" />
                        <p className="text-sm font-bold text-white/70">No playback source available.</p>
                      </>
                    )}
                  </div>
                )}

                {/* ── Overlay Controls (Animated) ─────────────────────────── */}
                {isExpanded && !isLocked && (
                  <div className={`absolute inset-0 z-10 transition-opacity duration-200 ${showControls || playerMenu ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <PlayerTopBar
                      showControls={showControls}
                      playerMenu={playerMenu}
                      currentItem={currentItem}
                      source={source}
                      contextSubtitle={contextSubtitle}
                      playbackSpeed={playbackSpeed}
                      isSeries={isSeries}
                      nextEpisode={nextEpisode || null}
                      saved={saved}
                      pipSupported={pipSupported}
                      isBrowserFullscreen={isBrowserFullscreen}
                      onMinimize={minimize}
                      onCycleSpeed={cycleSpeed}
                      onPlayNextEpisode={playNextEpisode}
                      onToggleWatchlist={() => toggleWatchlist(currentItem)}
                      onTogglePip={togglePip}
                      onHideControls={() => {
                        setShowControls(false);
                        setPlayerMenu(null);
                      }}
                      onToggleMenu={() => setPlayerMenu(playerMenu ? null : 'settings')}
                      onToggleFullscreen={toggleFullscreen}
                      onLock={() => {
                        setIsLocked(true);
                        setShowControls(false);
                        setPlayerMenu(null);
                      }}
                    />

                    <PlayerCenterControls
                      showControls={showControls}
                      playerMenuOpen={Boolean(playerMenu)}
                      isPlaying={isPlaying}
                      isLoading={isLoading}
                      switchingSource={switchingSource}
                      isEnded={isEnded}
                      onTogglePlay={animatedTogglePlay}
                      onSeekBy={seekBy}
                    />

                    <CinemaScrubber
                      videoRef={videoRef}
                      duration={duration}
                      bufferedEnd={bufferedEnd}
                      title={currentItem.title}
                      showControls={showControls}
                      playerMenuOpen={Boolean(playerMenu)}
                      onSeek={seekDirectly}
                      onRevealControls={revealControls}
                    />

                    {/* ── Settings Dropdown / Modal (Unified) ──────────────── */}
                    <PlayerSettingsModal
                      isOpen={Boolean(playerMenu)}
                      onClose={() => setPlayerMenu(null)}
                      playbackSpeed={playbackSpeed}
                      onSelectSpeed={chooseSpeed}
                      videoFit={videoFit}
                      onSelectFit={applyVideoFit}
                      selectedQuality={selectedQuality}
                      hlsLevels={hlsLevels}
                      qualities={source?.qualities}
                      onSelectQuality={chooseQuality}
                      hlsAudioTracks={hlsAudioTracks}
                      sourceAudioTracks={source?.audioTracks}
                      selectedAudio={selectedAudio}
                      onSelectHlsAudio={(trackId, label) => {
                        if (hlsRef.current) {
                          hlsRef.current.audioTrack = trackId;
                          setSelectedAudio(label);
                        }
                        setPlayerMenu(null);
                        revealControls();
                      }}
                      onSelectSourceAudio={(url) => void chooseAudio(url)}
                      subtitles={source?.subtitles}
                      selectedSubtitle={selectedSubtitle}
                      onSelectSubtitle={(id) => {
                        setSelectedSubtitle(id);
                        setPlayerMenu(null);
                        revealControls();
                      }}
                    />
                  </div>
                )}

                {/* ── Unlock Pill Banner (When Locked) ────────────────── */}
                {isLocked && showUnlockBanner && (
                  <div className="absolute right-[max(1.5rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2 z-30 pointer-events-auto">
                    <button
                      onClick={() => {
                        setIsLocked(false);
                        setShowControls(true);
                        setShowUnlockBanner(false);
                      }}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-black/75 border border-white/20 text-white backdrop-blur-md hover:bg-black/90 transition shadow-2xl active:scale-95"
                    >
                      <Lock size={16} className="text-[#7fffd2]" />
                      <span className="text-xs font-bold">Controls locked · tap to unlock</span>
                    </button>
                  </div>
                )}

                {/* ── HUD Feedback Overlays ───────────────────────────── */}
                {/* Brightness HUD */}
                {hudBrightness !== null && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2 rounded-2xl bg-black/75 border border-white/15 px-5 py-4 backdrop-blur-md shadow-2xl text-white">
                    <div className="flex items-center gap-2">
                      <Sun size={20} className="text-[#7fffd2]" />
                      <span className="text-xs font-bold">Brightness: {Math.round(hudBrightness * 100)}%</span>
                    </div>
                    <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden mt-1">
                      <div
                        className="h-full bg-gradient-to-r from-[#7fffd2] to-[#3b82f6] rounded-full"
                        style={{ width: `${Math.min(100, Math.round((hudBrightness / 1.5) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Volume HUD */}
                {hudVolume !== null && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2 rounded-2xl bg-black/75 border border-white/15 px-5 py-4 backdrop-blur-md shadow-2xl text-white">
                    <div className="flex items-center gap-2">
                      {hudVolume === 0 ? <VolumeX size={20} className="text-red-400" /> : <Volume2 size={20} className="text-[#7fffd2]" />}
                      <span className="text-xs font-bold">Volume: {Math.round(hudVolume * 100)}%</span>
                    </div>
                    <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden mt-1">
                      <div
                        className="h-full bg-gradient-to-r from-[#7fffd2] to-[#3b82f6] rounded-full"
                        style={{ width: `${Math.round(hudVolume * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Zoom HUD */}
                {fitFeedback && (
                  <div className="player-fit-feedback pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 border border-white/15 px-4 py-2 text-xs font-black text-white backdrop-blur-md shadow-xl flex items-center gap-2">
                    <Maximize2 size={14} className="text-[#7fffd2]" />
                    <span>Zoom: {fitFeedback}</span>
                  </div>
                )}

                {/* Double Tap Seek Feedback */}
                {seekFeedback && (
                  <div className={`player-seek-feedback pointer-events-none absolute inset-y-0 z-30 w-1/2 flex items-center justify-center ${seekFeedback === 'left' ? 'left-0' : 'right-0'}`}>
                    <div className="flex flex-col items-center gap-2 text-white drop-shadow-2xl">
                      <span className="w-16 h-16 rounded-full bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center">
                        {seekFeedback === 'left' ? <Rewind size={30} /> : <FastForward size={30} />}
                      </span>
                      <span className="text-xs font-black">10 seconds</span>
                    </div>
                  </div>
                )}

                {/* Control Pulse */}
                {controlPulse && (
                  <div className="player-control-pulse pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                    <span className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white">
                      {controlPulse === 'play' ? <Play size={34} className="fill-current ml-1" /> : <Pause size={34} className="fill-current" />}
                    </span>
                  </div>
                )}

                {playbackError && source && (
                  <div className="absolute left-1/2 top-5 -translate-x-1/2 z-40 rounded-full bg-red-500/90 px-4 py-2 text-xs font-bold text-white shadow-xl">
                    {playbackError}
                  </div>
                )}
              </div>

              {/* ── Secondary Controls Below Player Stage ──────────── */}
              {isExpanded && (
                <div className="watch-glass mt-3 flex items-center justify-between gap-3 flex-wrap rounded-2xl px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button onClick={previousItem} className="player-pill"><SkipBack size={14} />Previous</button>
                    <button onClick={nextItem} className="player-pill">Next<SkipForward size={14} /></button>
                  </div>
                  <div className="flex items-center justify-center flex-wrap gap-2">
                    {currentItem.mediaType !== 'tv' && <button onClick={toggleShuffle} className={`player-pill ${shuffle ? 'active' : ''}`}><Shuffle size={14} />Shuffle</button>}
                    <button onClick={cycleRepeatMode} className={`player-pill ${repeatMode !== 'OFF' ? 'active' : ''}`}>{repeatMode === 'ONE' ? <Repeat1 size={14} /> : <Repeat size={14} />}{repeatMode === 'ONE' ? 'Repeat one' : repeatMode === 'ALL' ? 'Repeat all' : 'Repeat'}</button>
                    <button onClick={() => setShowTimer(true)} className={`player-pill ${sleepTimerMinutes ? 'active' : ''}`}><Clock3 size={14} />{sleepTimerMinutes ? formatTime(sleepRemainingSeconds) : 'Timer'}</button>
                  </div>
                </div>
              )}

              {/* ── Series Seasons & Episodes ───────────────────────── */}
              {isExpanded && isSeries && (
                <PlayerEpisodesSection
                  episodesRef={episodesRef}
                  episodeSeason={episodeSeason}
                  episodesPending={episodesPending}
                  episodesLoading={episodesLoading}
                  episodeError={episodeError}
                  playerEpisodes={playerEpisodes}
                  currentItem={currentItem}
                  switchingEpisode={switchingEpisode}
                  onSelectSeason={(season) => void loadPlayerSeason(season)}
                  onPlayEpisode={(episode) => void playPlayerEpisode(episode)}
                />
              )}
            </div>

            {/* ── Sidebar Metadata ─────────────────────────────────── */}
            {isExpanded && (
              <PlayerSidebarDetails
                currentItem={currentItem}
                source={source}
                selectedAudio={selectedAudio}
                saved={saved}
                isDownloaded={isDownloaded}
                isDownloading={isDownloading}
                themeMode={themeMode}
                relatedItems={relatedItems}
                queue={queue}
                queueIndex={queueIndex}
                showQueue={showQueue}
                onToggleWatchlist={() => toggleWatchlist(currentItem)}
                onOfflineAction={handleOfflineAction}
                onShare={share}
                onCycleTheme={cycleThemeMode}
                onPlayItem={(item, q) => playItem(item, q)}
              />
            )}
          </main>
        </div>
      </div>

      {/* ── Mini Player (Docked at Bottom) ───────────────────────── */}
      {!isExpanded && (
        <div className="fixed left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[620px] z-[85] bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-5 rounded-2xl border border-white/15 bg-[#121c21]/95 backdrop-blur-2xl shadow-[0_14px_45px_rgba(0,0,0,.45)] overflow-hidden select-none">
          <div className="flex items-center gap-3 p-2.5">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="relative w-16 h-11 rounded-xl overflow-hidden bg-black/40 shrink-0 cursor-pointer active:scale-95 transition"
              title="Expand player"
            >
              {background ? <Image src={background} alt="" fill sizes="64px" className="object-cover" /> : <Play size={18} className="text-white/60 m-auto" />}
              <span className="absolute inset-0 bg-black/15" />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="min-w-0 flex-1 text-left cursor-pointer"
              title="Expand player"
            >
              <h3 className="text-xs font-black truncate text-white">{currentItem.title}</h3>
              <p className={`text-[10px] truncate mt-0.5 ${playbackError ? 'text-red-400' : 'text-white/60'}`}>
                {playbackError || (source?.kind === 'youtube' ? 'Official trailer • tap to resume' : isPlaying ? 'Playing now' : 'Paused')}
              </p>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (source?.kind === 'youtube') {
                  setIsExpanded(true);
                } else {
                  animatedTogglePlay();
                }
              }}
              className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0 cursor-pointer transition active:scale-95 shadow-md"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} className="fill-current" />
              ) : (
                <Play size={18} className="fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextItem();
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition active:scale-95 shrink-0"
              title="Next video"
            >
              <SkipForward size={18} className="fill-current" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition active:scale-95 shrink-0"
              title="Expand player"
            >
              <Maximize2 size={17} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closePlayer();
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition active:scale-95 shrink-0"
              title="Close player"
            >
              <X size={17} />
            </button>
          </div>
          <MiniScrubber
            videoRef={videoRef}
            duration={duration}
            onSeek={seekDirectly}
          />
        </div>
      )}

      {/* ── Sleep Timer Dialog ──────────────────────────────────── */}
      {showTimer && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex items-center justify-center p-5" onClick={() => setShowTimer(false)}>
          <div className="watch-dialog w-full max-w-xs rounded-[26px] p-5 bg-[#121c21] border border-white/10 text-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[.17em] font-black text-[#7fffd2]">Playback</p>
                <h3 className="font-black mt-0.5 text-base">Sleep timer</h3>
              </div>
              <button onClick={() => setShowTimer(false)} className="icon-button"><X size={17} /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[5, 10, 15, 30, 45, 60].map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => {
                    setSleepTimer(minutes);
                    setShowTimer(false);
                  }}
                  className={`py-3 rounded-2xl border text-xs font-bold transition ${
                    sleepTimerMinutes === minutes
                      ? 'bg-[#7fffd2] text-black border-transparent'
                      : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                >
                  {minutes} minutes
                </button>
              ))}
            </div>
            {sleepTimerMinutes && (
              <button
                onClick={() => {
                  setSleepTimer(null);
                  setShowTimer(false);
                }}
                className="w-full mt-3 py-3 rounded-2xl bg-red-500/10 text-red-300 border border-red-500/20 text-xs font-bold hover:bg-red-500/20"
              >
                Turn timer off
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
