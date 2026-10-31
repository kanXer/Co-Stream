'use client';

import React, { useEffect, useRef, useState } from 'react';
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
import { getOfflinePlaybackUrl, isVideoDownloaded } from '@/lib/offlineStore';
import { resolveNetMirrorPlayback } from '@/lib/playbackClient';
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

function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  try {
    const scale = Math.min(0.5, 480 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

function waitForViewportToSettle() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)));
  });
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
  const [heldVideoFrame, setHeldVideoFrame] = useState<string | null>(null);
  const [fullscreenTransitioning, setFullscreenTransitioning] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockBanner, setShowUnlockBanner] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [hudBrightness, setHudBrightness] = useState<number | null>(null);
  const [hudVolume, setHudVolume] = useState<number | null>(null);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);
  const [scrubbingTime, setScrubbingTime] = useState<number | null>(null);
  const [hlsLevels, setHlsLevels] = useState<Array<{ id: number; label: string; height: number }>>([]);

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
    isExpanded?: boolean;
    isBrowserFullscreen?: boolean;
  }>({});
  const currentId = currentItem?.id || null;

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    if (typeof window !== 'undefined' && !window.history.state?.costreamPlayer) {
      window.history.pushState({ costreamPlayer: true }, '');
    }

    const onPopState = () => {
      if (source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
      setIsExpanded(false);
      closePlayer();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isExpanded, source, closePlayer, setIsExpanded]);

  const releaseHeldSeek = (video: HTMLVideoElement) => {
    if (!seekHoldRef.current.active) return;
    const resume = seekHoldRef.current.resume;
    seekHoldRef.current = { active: false, resume: false };
    if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
    seekHoldTimerRef.current = null;
    setHeldVideoFrame(null);
    if (resume) video.play().catch(() => undefined);
  };

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
    setSource(null);
    setDirectUrl(null);
    setHeldVideoFrame(null);
    setScrubbingTime(null);

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
    setHeldVideoFrame(null);
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
    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3500);
    }
  };

  useEffect(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!isLocked) setShowControls(true);
    if (isPlaying && isExpanded && !isLocked) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3500);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isPlaying, isExpanded, currentId, isLocked]);

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
      video.play().catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
      episodeDetailsLoaderRef.current?.();
    };

    if (isHls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        startFragPrefetch: true,
        testBandwidth: false,
        abrEwmaDefaultEstimate: 1_500_000,
        abrEwmaFastLive: 2,
        abrEwmaSlowLive: 9,
        abrEwmaFastVoD: 2,
        abrEwmaSlowVoD: 9,
        capLevelToPlayerSize: false,
        maxBufferLength: 90,              // Buffer up to 90 seconds ahead!
        maxMaxBufferLength: 240,          // Up to 4 minutes ahead!
        maxBufferSize: 120 * 1024 * 1024, // 120 MB buffer!
        backBufferLength: 60,             // 1 minute back-buffer for instant rewind
        maxBufferHole: 0.8,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.3,
        nudgeMaxRetry: 10,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 400,
        manifestLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 400,
        levelLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 500,
        fragLoadingTimeOut: 25000,
        progressive: true,
      });
      // No level cap — all quality levels (480p, 720p, 1080p) available.
      hlsInstance.autoLevelCapping = -1;
      hlsRef.current = hlsInstance;
      // Attach media FIRST, then load source — recommended HLS.js order.
      hlsInstance.attachMedia(video);
      hlsInstance.loadSource(directUrl);

      let initialPlayStarted = false;
      let bufferedFragsCount = 0;

      const tryStartPlay = () => {
        if (initialPlayStarted) return;
        const current = video.currentTime;
        let ahead = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= current + 0.1 && current <= video.buffered.end(i)) {
            ahead = video.buffered.end(i) - current;
            break;
          }
        }
        // Wait until at least 5s of buffer ahead is ready OR at least 2 fragments buffered for smooth playback
        if (ahead >= 5 || bufferedFragsCount >= 2) {
          initialPlayStarted = true;
          reportPlayback({ isLoading: false });
          video.play().catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
        }
      };

      hlsInstance.on(Hls.Events.FRAG_BUFFERED, () => {
        bufferedFragsCount += 1;
        if (!initialPlayStarted) {
          tryStartPlay();
        }
      });

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (resumeAt > 2 && resumeAt < (video.duration || currentItem.durationSeconds) - 5) video.currentTime = resumeAt;
        pendingSeekRef.current = null;
        reportPlayback({ duration: video.duration || currentItem.durationSeconds, isLoading: true, error: null });
        video.volume = volume;
        video.playbackRate = playbackSpeed;
        episodeDetailsLoaderRef.current?.();

        // Safety fallback timer (2.2s): if fragments are extra large, ensure playback initiates
        setTimeout(() => {
          if (!initialPlayStarted) {
            initialPlayStarted = true;
            reportPlayback({ isLoading: false });
            video.play().catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
          }
        }, 2200);

        if (data.levels && data.levels.length > 1) {
          const parsed = data.levels.map((lvl, index) => ({
            id: index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
          })).sort((a, b) => b.height - a.height);
          setHlsLevels(parsed);
        } else {
          setHlsLevels([]);
        }
      });
      // Recovery: on non-fatal errors try to recover; on fatal errors report.
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          // Non-fatal buffer stall — nudge forward to escape the stall without
          // a full media error recovery (which briefly blacks out the video).
          if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL
          ) {
            try { hlsInstance?.startLoad(); } catch { hlsInstance?.recoverMediaError(); }
          }
          // Non-fatal network errors — restart loading silently.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { hlsInstance?.startLoad(); } catch { /* ignored */ }
          }
          return;
        }
        // Fatal error — attempt media recovery once, then network recovery,
        // then give up and show fallback quality or error.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsInstance?.recoverMediaError();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hlsInstance?.startLoad();
        } else {
          reportPlayback({ isLoading: false, isPlaying: false, error: 'This stream could not be played.' });
        }
      });
    } else {
      video.src = directUrl;
    }

    const onTime = () => {
      reportPlayback({ currentTime: video.currentTime, duration: video.duration || currentItem.durationSeconds });
      updateWatchProgress(currentItem.id, video.currentTime, video.duration || currentItem.durationSeconds);
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onPlay = () => {
      video.muted = volume === 0;
      video.volume = volume;
      video.playbackRate = playbackSpeed;
      reportPlayback({ isPlaying: true, isLoading: false, error: null });
    };
    const onPause = () => reportPlayback({ isPlaying: false, isLoading: false });
    const onWaiting = () => {
      if (seekHoldRef.current.active) return;
      reportPlayback({ isLoading: true });
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (video.readyState < 3) {
          if (hlsRef.current) {
            // For HLS: nudge the stream forward to escape the stall.
            // If the buffer is simply dry, startLoad() re-triggers fetching.
            try {
              hlsRef.current.startLoad();
            } catch {
              hlsRef.current.recoverMediaError();
            }
          } else {
            fallBackQuality();
          }
        }
      }, 2000);
    };
    const onCanPlay = () => {
      const current = video.currentTime;
      let ahead = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= current + 0.1 && current <= video.buffered.end(i)) {
          ahead = video.buffered.end(i) - current;
          break;
        }
      }
      if (ahead >= 2 || video.readyState >= 3) {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;
        reportPlayback({ isLoading: false, error: null });
      }
    };
    const onSeeked = () => {
      if (!seekHoldRef.current.active) return;
      requestAnimationFrame(() => requestAnimationFrame(() => releaseHeldSeek(video)));
    };
    const onError = () => {
      if (!directUrl || !video.src) return;
      if (!fallBackQuality()) reportPlayback({ isLoading: false, isPlaying: false, error: 'This video could not be played.' });
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('progress', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', onError);

    const controller: PlaybackController = {
      play: () => { video.play().catch(() => undefined); },
      pause: () => video.pause(),
      seek: (seconds) => { video.currentTime = Math.min(seconds, video.duration || seconds); },
      setVolume: (nextVolume) => { video.volume = nextVolume; },
    };
    registerController(controller);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('progress', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', onError);
      if (stallTimer) clearTimeout(stallTimer);
      if (seekHoldTimerRef.current) clearTimeout(seekHoldTimerRef.current);
      seekHoldTimerRef.current = null;
      seekHoldRef.current = { active: false, resume: false };
      setHeldVideoFrame(null);
      video.pause();
      hlsRef.current = null;
      setHlsLevels([]);
      hlsInstance?.destroy();
      registerController(null);
    };
  }, [source, directUrl, currentId, handleEnded, registerController, reportPlayback, updateWatchProgress, playbackSpeed]);

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
    // Tablets (especially iPad Safari) use webkit-prefixed fullscreen events.
    const onFullscreen = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      const active = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
      setIsBrowserFullscreen(active);
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: string) => Promise<void>;
      };
      if (active) orientation.lock?.('landscape').catch(() => undefined);
      else orientation.unlock?.();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
    };
  }, []);

  useEffect(() => {
    const handleOrientationOrResize = () => {
      // Clean View on Rotation: In landscape mode or rotation, close menus and auto-hide HUD for clean view
      if (typeof window !== 'undefined' && window.innerWidth > window.innerHeight) {
        setPlayerMenu(null);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 1200);
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
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        actions.animatedTogglePlay?.();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        actions.seekBy?.(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        actions.seekBy?.(10);
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
  const activePosition = scrubbingTime ?? currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (activePosition / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const background = currentItem.backdropUrl || currentItem.posterUrl;
  const isSeries = currentItem.mediaType === 'tv';
  const episodesPending = isSeries && (episodesLoading || (!currentItem.episodes && !episodeError));
  const currentEpNum = currentItem.selectedEpisode || 1;
  const nextEpisode = playerEpisodes.find((ep) => ep.number === currentEpNum + 1);
  const isEnded = duration > 0 && currentTime >= duration - 0.5;

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

  const chooseQuality = (label: string, url: string, hlsLevelIndex?: number) => {
    setSelectedQuality(label);
    setPlayerMenu(null);
    revealControls();

    if (hlsRef.current && typeof hlsLevelIndex === 'number') {
      // -1 = HLS auto/ABR mode; any other value = pin to that level index.
      hlsRef.current.currentLevel = hlsLevelIndex;
      hlsRef.current.autoLevelCapping = hlsLevelIndex === -1 ? -1 : hlsLevelIndex;
      return;
    }

    if (url && url !== directUrl) {
      pendingSeekRef.current = videoRef.current?.currentTime || currentTime;
      setDirectUrl(url);
    }
  };

  const chooseAudio = async (resolveUrl: string) => {
    setSwitchingSource(true);
    setPlayerMenu(null);
    pendingSeekRef.current = videoRef.current?.currentTime || currentTime;
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

  const seekDirectly = (seconds: number) => {
    const video = videoRef.current;
    const safeTarget = Math.max(0, Math.min(seconds, duration || seconds));
    if (source?.kind === 'direct' && video) {
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad(safeTarget);
        } catch {}
      }
      video.currentTime = safeTarget;
      reportPlayback({ currentTime: safeTarget });
      updateWatchProgress(currentItem.id, safeTarget, video.duration || currentItem.durationSeconds);
    } else if (source?.kind === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.seekTo(safeTarget, true);
      reportPlayback({ currentTime: safeTarget });
      updateWatchProgress(currentItem.id, safeTarget, duration);
    } else {
      seek(safeTarget);
    }
  };

  const seekBy = (deltaSeconds: number) => {
    const current = videoRef.current?.currentTime ?? currentTime;
    const target = Math.max(0, Math.min(current + deltaSeconds, duration || current + deltaSeconds));
    seekDirectly(target);
    revealControls();
  };

  const handleStageTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
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
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const stage = stageRef.current;
      const height = stage?.clientHeight || 400;

      if (!isDraggingRef.current && Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
        isDraggingRef.current = true;
        const width = stage?.clientWidth || 600;
        const rect = stage?.getBoundingClientRect();
        const touchX = rect ? touch.clientX - rect.left : start.x;
        dragModeRef.current = touchX < width / 2 ? 'brightness' : 'volume';
      }

      if (isDraggingRef.current && dragModeRef.current) {
        event.preventDefault();
        if (dragModeRef.current === 'brightness') {
          const delta = -dy / height * 1.2;
          const nextBright = Math.max(0.2, Math.min(1.5, start.initialBright + delta));
          setBrightness(nextBright);
          setHudBrightness(nextBright);
          setHudVolume(null);
        } else if (dragModeRef.current === 'volume') {
          const delta = -dy / height * 1.2;
          const nextVol = Math.max(0, Math.min(1, start.initialVol + delta));
          setVolume(nextVol);
          setHudVolume(nextVol);
          setHudBrightness(null);
        }
      }
    }
  };

  const handleStageTouchEnd = () => {
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
    if ((event.target as HTMLElement).closest('button,input,label,.player-controls-menu,.player-bottom-bar')) return;

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

  const calculateScrubTarget = (clientX: number) => {
    const el = scrubberRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return duration * fraction;
  };

  const handleScrubberPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    isScrubbingRef.current = true;
    const target = calculateScrubTarget(event.clientX);
    setScrubbingTime(target);
    revealControls();
  };

  const handleScrubberPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    const target = calculateScrubTarget(event.clientX);
    setScrubbingTime(target);
    revealControls();
  };

  const handleScrubberPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    isScrubbingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    const target = calculateScrubTarget(event.clientX);
    setScrubbingTime(null);
    seekDirectly(target);
    revealControls();
  };

  const handleScrubberPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    event.stopPropagation();
    isScrubbingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setScrubbingTime(null);
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
    if (fullscreenTransitioning || seekHoldRef.current.active) return;
    setFullscreenTransitioning(true);
    const video = videoRef.current;
    const shouldResume = source?.kind === 'youtube'
      ? isPlaying
      : Boolean(video && (!video.paused || isPlaying));
    if (video) {
      setHeldVideoFrame(captureVideoFrame(video));
      video.pause();
    } else if (source?.kind === 'youtube') {
      youtubePlayerRef.current?.pauseVideo();
    }

    // Cross-browser / cross-tablet fullscreen helper types
    type WebkitDoc = Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
    };
    type WebkitEl = Element & {
      webkitRequestFullscreen?: () => Promise<void>;
    };

    const doc = document as WebkitDoc;
    const stageEl = stageRef.current as WebkitEl | null;
    const isFs = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

    try {
      if (!isFs) {
        // Try standard API first (Chrome/Firefox/new Safari), then webkit
        // (iPad Safari ≤15), then fall back to native video fullscreen.
        if (stageEl?.requestFullscreen) {
          // Avoid passing options object — older WebKit throws on unknown options.
          await stageEl.requestFullscreen();
        } else if (stageEl?.webkitRequestFullscreen) {
          await stageEl.webkitRequestFullscreen();
        } else {
          // Last resort: iOS native video fullscreen
          const nativeVideo = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
          nativeVideo?.webkitEnterFullscreen?.();
        }
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (value: string) => Promise<void>;
        };
        await orientation.lock?.('landscape').catch(() => undefined);
      } else {
        screen.orientation.unlock?.();
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => undefined);
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Unexpected error — silently ignore so finally block always runs.
    } finally {
      await waitForViewportToSettle();
      setHeldVideoFrame(null);
      if (shouldResume) {
        if (source?.kind === 'youtube') youtubePlayerRef.current?.playVideo();
        else video?.play().catch(() => undefined);
      }
      setFullscreenTransitioning(false);
    }
  };

  const minimize = () => {
    try {
      if (source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
    } catch {}
    setIsExpanded(false);
    closePlayer();
    if (typeof window !== 'undefined' && window.history.state?.costreamPlayer) {
      try {
        window.history.back();
      } catch {}
    }
  };

  keyboardActionsRef.current = {
    toggleFullscreen,
    animatedTogglePlay,
    seekBy,
    minimize,
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
      <div className={isExpanded ? 'watch-shell fixed inset-0 z-[70] overflow-y-auto no-scrollbar' : 'fixed -left-[9999px] top-0 w-px h-px overflow-hidden'}>
        {isExpanded && background && (
          <div className="watch-backdrop fixed inset-0 pointer-events-none">
            <Image src={background} alt="" fill sizes="100vw" priority className="watch-backdrop-image object-cover" />
            <div className="watch-backdrop-shade absolute inset-0 bg-black/85" />
          </div>
        )}

        <div className={isExpanded ? 'relative min-h-screen flex flex-col' : ''}>
          <main className={isExpanded ? 'watch-main relative flex-1 w-full max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5' : ''}>
            <div className="min-w-0">
              <div
                ref={stageRef}
                onMouseMove={revealControls}
                onTouchStart={handleStageTouchStart}
                onTouchMove={handleStageTouchMove}
                onTouchEnd={handleStageTouchEnd}
                onClick={handleStageTap}
                className={isExpanded ? `player-stage relative aspect-video w-full rounded-2xl sm:rounded-[26px] overflow-hidden bg-black shadow-[0_30px_90px_rgba(0,0,0,.7)] border border-white/10 select-none ${showControls ? 'cursor-default' : 'cursor-none'}` : 'w-px h-px'}
              >
                {/* ── Video Element ────────────────────────────────────────── */}
                {source?.kind === 'direct' && directUrl && (
                  <video
                    ref={videoRef}
                    key={`${currentItem.id}-${directUrl}`}
                    src={directUrl && directUrl.includes('.m3u8') ? undefined : directUrl}
                    poster={currentItem.backdropUrl || currentItem.posterUrl || undefined}
                    playsInline
                    controls={false}
                    preload="auto"
                    autoPlay
                    muted
                    style={{
                      filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
                      transform: 'translateZ(0)',
                      WebkitTransform: 'translateZ(0)',
                      contain: 'paint',
                    }}
                    className={`w-full h-full bg-black transition-[object-fit] duration-200 ${
                      videoFit === 'cover' ? 'object-cover' : videoFit === 'fill' ? 'object-fill' : 'object-contain'
                    }`}
                  >
                    {(source.subtitles || []).map((track) => (
                      <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />
                    ))}
                  </video>
                )}

                {source?.kind === 'direct' && fullscreenTransitioning && heldVideoFrame && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[5] bg-black bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url(${heldVideoFrame})`,
                      backgroundSize: videoFit === 'cover' ? 'cover' : videoFit === 'fill' ? '100% 100%' : 'contain',
                    }}
                  />
                )}

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
                  <div className={`absolute inset-0 z-10 transition-opacity duration-200 pointer-events-none ${showControls || playerMenu ? 'opacity-100' : 'opacity-0'}`}>
                    {/* ── Unified Top Bar ───────────────────────────────────── */}
                    <div className="player-controls-top absolute inset-x-0 top-0 pt-[max(0.75rem,env(safe-area-inset-top))] px-[max(1.25rem,max(env(safe-area-inset-left),env(safe-area-inset-right)))] pb-12 bg-gradient-to-b from-black/90 via-black/45 to-transparent flex items-center justify-between gap-3 pointer-events-auto">
                      {/* Top-Left: Back + Title & Subtitle */}
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            minimize();
                          }}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
                          title="Minimize player"
                        >
                          <ChevronLeft size={22} />
                        </button>
                        <div className="min-w-0">
                          <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-[42vw] sm:max-w-[48vw]">
                            {currentItem.title}
                          </h2>
                          <div className="flex items-center gap-1.5 text-[10px] text-white/60 font-medium truncate mt-0.5">
                            {source?.kind === 'youtube' ? (
                              <span className="text-[#7fffd2] font-bold">Official Trailer</span>
                            ) : (
                              <span>{contextSubtitle}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Top-Right: Speed + Next + Bookmark + PiP + Settings + Fullscreen */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Playback speed badge */}
                        <button
                          onClick={cycleSpeed}
                          className="px-2.5 sm:px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] sm:text-xs font-bold text-white backdrop-blur-md transition active:scale-95"
                          title="Click to cycle speed"
                        >
                          {playbackSpeed}×
                        </button>

                        {/* Next episode (Series only) */}
                        {isSeries && (
                          <button
                            onClick={playNextEpisode}
                            className="w-10 h-10 rounded-full bg-[#7fffd2]/15 hover:bg-[#7fffd2]/25 border border-[#7fffd2]/30 flex items-center justify-center text-[#7fffd2] backdrop-blur-md transition active:scale-95"
                            title={nextEpisode ? `Next: Episode ${nextEpisode.number}` : 'Next Episode'}
                          >
                            <SkipForward size={18} className="fill-current" />
                          </button>
                        )}

                        {/* Bookmark */}
                        <button
                          onClick={() => toggleWatchlist(currentItem)}
                          className={`w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center backdrop-blur-md transition active:scale-95 ${
                            saved ? 'text-[#7fffd2]' : 'text-white'
                          }`}
                          title={saved ? 'Remove from My List' : 'Add to My List'}
                        >
                          <Bookmark size={18} className={saved ? 'fill-current' : ''} />
                        </button>

                        {/* PiP */}
                        {pipSupported && (
                          <button
                            onClick={togglePip}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 hidden sm:flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
                            title="Picture in Picture"
                          >
                            <PictureInPicture2 size={18} />
                          </button>
                        )}

                        {/* Clean View Toggle */}
                        <button
                          onClick={() => {
                            setShowControls(false);
                            setPlayerMenu(null);
                          }}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95"
                          title="Clean View (Hide all controls)"
                        >
                          <EyeOff size={18} />
                        </button>

                        {/* Settings */}
                        <button
                          onClick={() => setPlayerMenu(playerMenu ? null : 'settings')}
                          className={`w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95 ${
                            playerMenu ? '!bg-white/25 border-[#7fffd2]' : ''
                          }`}
                          title="Playback settings"
                        >
                          <Settings2 size={18} />
                        </button>

                        {/* Fullscreen */}
                        <button
                          onClick={toggleFullscreen}
                          disabled={fullscreenTransitioning}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition active:scale-95 disabled:opacity-50"
                          title="Toggle fullscreen"
                        >
                          {isBrowserFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* ── Right Lock Button (CenterEnd - Fullscreen) ───────── */}
                    <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2 z-20 pointer-events-auto">
                      <button
                        onClick={() => {
                          setIsLocked(true);
                          setShowControls(false);
                          setPlayerMenu(null);
                        }}
                        className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center text-white/80 hover:text-white backdrop-blur-md transition active:scale-95 shadow-xl"
                        title="Lock player controls"
                      >
                        <Lock size={18} />
                      </button>
                    </div>

                    {/* ── Center Playback Controls ─────────────────────────── */}
                    <div className="absolute inset-0 flex items-center justify-center gap-6 sm:gap-9 pointer-events-none">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          seekBy(-10);
                        }}
                        className="pointer-events-auto relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition active:scale-90 shadow-2xl"
                        title="Rewind 10 seconds"
                      >
                        <Rewind size={24} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          animatedTogglePlay();
                        }}
                        disabled={switchingSource}
                        className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white hover:bg-white/95 text-black flex items-center justify-center shadow-2xl transition-transform active:scale-90 disabled:opacity-60"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isLoading || switchingSource ? (
                          <span className="w-7 h-7 rounded-full border-3 border-black/25 border-t-black animate-spin" />
                        ) : isEnded ? (
                          <RotateCw size={30} className="stroke-[2.5]" />
                        ) : isPlaying ? (
                          <Pause size={32} className="fill-current" />
                        ) : (
                          <Play size={32} className="fill-current ml-1" />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          seekBy(10);
                        }}
                        className="pointer-events-auto relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition active:scale-90 shadow-2xl"
                        title="Forward 10 seconds"
                      >
                        <FastForward size={24} />
                      </button>
                    </div>

                    {/* ── Bottom Cinema Scrubber & Timestamps ──────────────── */}
                    <div className="player-bottom-bar absolute inset-x-0 bottom-0 pt-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-[max(1.25rem,max(env(safe-area-inset-left),env(safe-area-inset-right)))] bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-auto">
                      {/* Timestamps */}
                      <div className="flex items-center justify-between text-xs font-bold text-white mb-2 tabular-nums">
                        <span className="text-[#7fffd2]">{formatTime(activePosition)}</span>
                        <span className="text-white/60">{formatTime(duration)}</span>
                      </div>

                      {/* Cinema Scrubber with full drag and touch support */}
                      <div
                        ref={scrubberRef}
                        onPointerDown={handleScrubberPointerDown}
                        onPointerMove={handleScrubberPointerMove}
                        onPointerUp={handleScrubberPointerUp}
                        onPointerCancel={handleScrubberPointerCancel}
                        className="relative h-10 -my-2 flex items-center cursor-pointer group select-none touch-none"
                      >
                        {/* Floating Scrub Badge */}
                        {scrubbingTime !== null && (
                          <div
                            className="absolute -top-7 -translate-x-1/2 px-2.5 py-1 rounded-md bg-[#0e1315]/95 border border-[#7fffd2]/40 text-[#7fffd2] text-[11px] font-black pointer-events-none shadow-2xl tracking-wider backdrop-blur-md"
                            style={{ left: `${progressPercent}%` }}
                          >
                            {formatTime(scrubbingTime)}
                          </div>
                        )}

                        <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden relative transition-[height] group-hover:h-2.5">
                          {/* Buffered bar */}
                          <div
                            className="absolute inset-y-0 left-0 bg-white/30 rounded-full transition-[width] duration-300"
                            style={{ width: `${bufferedPercent}%` }}
                          />
                          {/* Gradient progress bar */}
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#7fffd2] to-[#3b82f6] rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        {/* Thumb */}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-2xl border border-white/40 ring-4 ring-[#7fffd2]/30 transition-transform ${
                            scrubbingTime !== null ? 'scale-125 ring-[#7fffd2]/60' : 'group-hover:scale-125'
                          }`}
                          style={{ left: `${progressPercent}%` }}
                        />
                      </div>

                      {/* Footer branding */}
                      <div className="flex items-center justify-between mt-2.5 px-0.5 text-[9px] font-bold text-white/45 uppercase tracking-wider">
                        <span className="truncate max-w-[65%]">{currentItem.title}</span>
                        <span className="tracking-[0.2em] font-black text-white/40">CO-STREAM PLAYER</span>
                      </div>
                    </div>

                    {/* ── Settings Dropdown / Modal (Unified) ──────────────── */}
                    {playerMenu && (
                      <div className="player-controls-menu pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(3.8rem,calc(env(safe-area-inset-top)+3rem))] w-72 sm:w-80 max-h-[75%] overflow-y-auto rounded-2xl border border-white/15 bg-[#0e1315]/95 p-3 shadow-2xl backdrop-blur-2xl z-40 text-white">
                        <div className="flex items-center justify-between px-1 py-1 border-b border-white/10 mb-2">
                          <h3 className="text-xs uppercase tracking-[.18em] font-black text-[#7fffd2]">
                            Playback settings
                          </h3>
                          <button onClick={() => setPlayerMenu(null)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
                            <X size={15} />
                          </button>
                        </div>

                        {/* Section: Playback Speed */}
                        <div className="mb-3">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Speed</p>
                          <div className="grid grid-cols-6 gap-1">
                            {SPEED_OPTIONS.map((speed) => (
                              <button
                                key={speed}
                                onClick={() => chooseSpeed(speed)}
                                className={`py-1.5 rounded-lg text-xs font-bold text-center border transition ${
                                  playbackSpeed === speed
                                    ? 'bg-[#7fffd2] text-black border-transparent'
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                              >
                                {speed}×
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Section: Picture Fit */}
                        <div className="mb-3">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Picture</p>
                          <div className="grid grid-cols-3 gap-1">
                            {(['contain', 'cover', 'fill'] as const).map((fit) => (
                              <button
                                key={fit}
                                onClick={() => applyVideoFit(fit)}
                                className={`py-1.5 rounded-lg text-xs font-bold text-center border capitalize transition ${
                                  videoFit === fit
                                    ? 'bg-[#7fffd2] text-black border-transparent'
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                              >
                                {fit === 'contain' ? 'Fit' : fit === 'cover' ? 'Fill' : 'Stretch'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Section: Quality */}
                        {((hlsLevels.length > 0) || (source?.qualities && source.qualities.length > 0)) && (
                          <div className="mb-3">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Quality</p>
                            <div className="space-y-1">
                              {hlsLevels.length > 0 ? (
                                <>
                                  <button
                                    onClick={() => chooseQuality('Auto', '', -1)}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                      selectedQuality === 'Auto'
                                        ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                        : 'hover:bg-white/10 text-white/80'
                                    }`}
                                  >
                                    <span>Auto (Adaptive)</span>
                                    {selectedQuality === 'Auto' && <Check size={14} className="text-[#7fffd2]" />}
                                  </button>
                                  {hlsLevels.map((lvl) => (
                                    <button
                                      key={lvl.id}
                                      onClick={() => chooseQuality(lvl.label, '', lvl.id)}
                                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                        selectedQuality === lvl.label
                                          ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                          : 'hover:bg-white/10 text-white/80'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {lvl.label}
                                        {lvl.height >= 1080 && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-[#7fffd2]/20 text-[#7fffd2]">HD</span>}
                                        {lvl.height === 480 && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-white/10 text-white/50">SD</span>}
                                      </span>
                                      {selectedQuality === lvl.label && <Check size={14} className="text-[#7fffd2]" />}
                                    </button>
                                  ))}
                                </>
                              ) : (
                                source?.qualities?.map((quality) => (
                                  <button
                                    key={`${quality.label}-${quality.url}`}
                                    onClick={() => chooseQuality(quality.label, quality.url)}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                      selectedQuality === quality.label
                                        ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                        : 'hover:bg-white/10 text-white/80'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      {quality.label}
                                      {quality.label === '1080p' && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-[#7fffd2]/20 text-[#7fffd2]">HD</span>}
                                      {quality.label === '480p' && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-white/10 text-white/50">SD</span>}
                                    </span>
                                    {selectedQuality === quality.label && <Check size={14} className="text-[#7fffd2]" />}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* Section: Audio */}
                        {source?.audioTracks && source.audioTracks.length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Audio</p>
                            <div className="space-y-1">
                              {source.audioTracks.map((track) => (
                                <button
                                  key={track.id}
                                  onClick={() => void chooseAudio(track.resolveUrl)}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                    selectedAudio === track.label
                                      ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                      : 'hover:bg-white/10 text-white/80'
                                  }`}
                                >
                                  <span>{track.label}</span>
                                  {selectedAudio === track.label && <Check size={14} className="text-[#7fffd2]" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Section: Subtitles */}
                        {source?.subtitles && source.subtitles.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 px-1">Subtitles</p>
                            <div className="space-y-1">
                              <button
                                onClick={() => setSelectedSubtitle('off')}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                  selectedSubtitle === 'off'
                                    ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                    : 'hover:bg-white/10 text-white/80'
                                }`}
                              >
                                <span>Off</span>
                                {selectedSubtitle === 'off' && <Check size={14} className="text-[#7fffd2]" />}
                              </button>
                              {source.subtitles.map((track) => (
                                <button
                                  key={track.id}
                                  onClick={() => setSelectedSubtitle(track.id)}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between text-left transition ${
                                    selectedSubtitle === track.id
                                      ? 'bg-[#7fffd2]/15 text-[#7fffd2]'
                                      : 'hover:bg-white/10 text-white/80'
                                  }`}
                                >
                                  <span>{track.label}</span>
                                  {selectedSubtitle === track.id && <Check size={14} className="text-[#7fffd2]" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                <section ref={episodesRef} className="watch-glass mt-4 scroll-mt-24 rounded-[26px] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="watch-accent text-[9px] uppercase tracking-[.18em] font-black">Seasons & episodes</p>
                      <h3 className="mt-1 text-lg font-black">Season {episodeSeason}</h3>
                    </div>
                    {episodesPending
                      ? <span className="h-7 w-24 animate-pulse rounded-full bg-[var(--line)]/70" />
                      : <span className="watch-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] font-bold">{playerEpisodes.length || currentItem.episodeCount || 0} episodes</span>}
                  </div>

                  <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                    {episodesPending
                      ? [0, 1, 2].map((index) => <span key={index} className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-[var(--line)]/70" />)
                      : (currentItem.seasons?.length
                          ? currentItem.seasons
                          : [{ number: episodeSeason, name: `Season ${episodeSeason}`, episodeCount: playerEpisodes.length }]
                        ).map((season) => (
                          <button
                            key={season.number}
                            onClick={() => void loadPlayerSeason(season.number)}
                            disabled={episodesLoading}
                            className={`watch-season-chip shrink-0 rounded-full px-4 py-2 text-[11px] font-black ${season.number === episodeSeason ? 'active' : ''}`}
                          >
                            S{season.number}<span className="ml-1.5 font-semibold opacity-60">{season.episodeCount || ''}</span>
                          </button>
                        ))}
                  </div>

                  {episodesPending ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[0, 1, 2, 3].map((index) => (
                        <div key={index} className="flex animate-pulse items-center gap-3 rounded-2xl border border-[var(--line)] p-2">
                          <span className="h-16 w-24 shrink-0 rounded-xl bg-[var(--line)]/75" />
                          <span className="min-w-0 flex-1 space-y-2"><span className="block h-3 w-3/4 rounded-full bg-[var(--line)]/75" /><span className="block h-2 w-1/2 rounded-full bg-[var(--line)]/55" /></span>
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
                            key={`${episodeSeason}-${episode.number}`}
                            onClick={() => void playPlayerEpisode(episode)}
                            disabled={switchingEpisode !== null}
                            className={`watch-episode-card group flex min-w-0 items-center gap-3 rounded-2xl p-2 text-left disabled:opacity-60 ${active ? 'active' : ''}`}
                          >
                            <span className="watch-episode-art relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black">
                              {episode.stillUrl ? <Image src={episode.stillUrl} alt="" fill sizes="96px" className="object-cover transition-transform duration-300 group-hover:scale-105" /> : `E${episode.number}`}
                              <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white">S{episodeSeason} E{episode.number}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-black">{episode.name || `Episode ${episode.number}`}</span>
                              <span className="watch-muted mt-1 block truncate text-[9px]">{episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : 'Episode'}{episode.airDate ? ` • ${episode.airDate}` : ''}</span>
                            </span>
                            <span className="watch-episode-play flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                              {switchingEpisode === episode.number ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Play size={14} className="fill-current ml-0.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="watch-muted py-10 text-center text-xs">No episodes are available for this season.</p>
                  )}
                  {episodeError && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-500">{episodeError}</p>}
                </section>
              )}
            </div>

            {/* ── Sidebar Metadata ─────────────────────────────────── */}
            {isExpanded && (
              <aside className="min-w-0">
                <div className="watch-glass rounded-[26px] p-5 lg:sticky lg:top-24">
                  <div className="flex items-start gap-3.5">
                    <div className="watch-poster relative w-16 h-24 rounded-xl overflow-hidden shrink-0">{currentItem.posterUrl && <Image src={currentItem.posterUrl} alt={currentItem.title} fill sizes="64px" className="object-cover" />}</div>
                    <div className="min-w-0 pt-1"><p className="watch-accent text-[9px] uppercase tracking-[.18em] font-black">{source?.label || 'Co-Stream'}{selectedAudio !== 'Original' ? ` • ${selectedAudio}` : ''}</p><h2 className="text-lg font-black leading-tight mt-1 line-clamp-2">{currentItem.title}</h2><p className="watch-muted text-[11px] mt-1">{currentItem.year} • {(currentItem.genres || []).slice(0, 2).join(' • ')}</p></div>
                  </div>
                  <p className="watch-muted mt-4 text-xs leading-6 line-clamp-5">{currentItem.overview}</p>
                  <div className="grid grid-cols-4 gap-2.5 mt-4">
                    <button
                      onClick={() => toggleWatchlist(currentItem)}
                      className={`h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 backdrop-blur-2xl border ${
                        saved
                          ? 'bg-[#7fffd2]/20 text-[#7fffd2] border-[#7fffd2]/40 shadow-[0_4px_20px_rgba(127,255,210,0.2)]'
                          : 'bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white border-white/15 shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.18)]'
                      }`}
                      title={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    >
                      <Bookmark size={20} className={saved ? 'fill-current' : ''} />
                    </button>
                    <div
                      className="h-12 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white border border-white/15 shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.18)] transition-all duration-200 active:scale-95"
                      title="Save offline"
                    >
                      <OfflineButton item={currentItem} source={source} compact />
                    </div>
                    <button
                      onClick={share}
                      className="h-12 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white border border-white/15 shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.18)] transition-all duration-200 active:scale-95"
                      title="Share title"
                    >
                      <Share2 size={20} />
                    </button>
                    <button
                      onClick={cycleThemeMode}
                      className="h-12 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white border border-white/15 shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.18)] transition-all duration-200 active:scale-95"
                      title="Toggle theme"
                    >
                      {themeMode === 'DARK' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                  </div>

                  {/* ── Related Movies / Recommendations ─────────────────── */}
                  {relatedItems.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-[var(--line)]">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-black tracking-wide text-white">
                          {currentItem.mediaType === 'tv' ? 'Related Series' : 'Related Movies'}
                        </p>
                        <span className="watch-muted text-[10px] font-bold">Recommended</span>
                      </div>
                      <div className="space-y-2 max-h-[340px] overflow-y-auto no-scrollbar pr-0.5">
                        {relatedItems.map((movie) => (
                          <div
                            key={movie.id}
                            onClick={() => playItem(movie, [movie, ...relatedItems])}
                            className="group flex items-center gap-3 p-2 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/5 hover:border-white/15 transition-all duration-200 cursor-pointer active:scale-[0.98]"
                          >
                            <div className="watch-poster relative w-12 h-16 rounded-xl overflow-hidden shrink-0 bg-white/5 shadow-md">
                              {movie.posterUrl ? (
                                <Image
                                  src={movie.posterUrl}
                                  alt={movie.title}
                                  fill
                                  sizes="48px"
                                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">🎬</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white group-hover:text-[#7fffd2] transition truncate">
                                {movie.title}
                              </h4>
                              <p className="watch-muted text-[10px] mt-0.5 font-medium truncate">
                                {movie.year} {movie.rating ? `• ★ ${Number(movie.rating).toFixed(1)}` : ''}
                              </p>
                            </div>
                            <span className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-[#7fffd2] group-hover:text-black flex items-center justify-center text-white transition-all duration-200 shrink-0">
                              <Play size={13} className="fill-current ml-0.5" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {currentItem.mediaType !== 'tv' && (showQueue || queue.length > 1) && (
                    <div className="mt-5 pt-4 border-t border-[var(--line)]">
                      <div className="flex items-center justify-between"><p className="text-xs font-black">Up next</p><span className="watch-muted text-[9px]">{queueIndex + 1} / {queue.length}</span></div>
                      <div className="mt-2 space-y-1 max-h-64 overflow-y-auto no-scrollbar">
                        {queue.map((entry, index) => (
                          <div key={`${entry.id}-${index}`} className={`watch-queue-item flex items-center gap-2.5 p-2 rounded-xl ${index === queueIndex ? 'active' : ''}`}>
                            <div className="watch-poster relative w-8 h-11 rounded-lg overflow-hidden shrink-0">{entry.posterUrl && <Image src={entry.posterUrl} alt="" fill sizes="32px" className="object-cover" />}</div>
                            <span className="text-[11px] font-bold truncate flex-1">{entry.title}</span>
                            {index === queueIndex && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </main>
        </div>
      </div>

      {/* ── Mini Player (Docked at Bottom) ───────────────────────── */}
      {!isExpanded && (
        <div className="fixed left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[620px] z-50 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-5 rounded-2xl border border-[var(--line)] bg-[var(--panel-elevated)]/95 backdrop-blur-2xl shadow-[0_14px_45px_rgba(0,0,0,.3)] overflow-hidden">
          <div className="flex items-center gap-3 p-2.5">
            <button onClick={() => setIsExpanded(true)} className="relative w-16 h-11 rounded-xl overflow-hidden bg-[var(--panel)] shrink-0">
              {background ? <Image src={background} alt="" fill sizes="64px" className="object-cover" /> : <Play size={18} />}
              <span className="absolute inset-0 bg-black/15" />
            </button>
            <button onClick={() => setIsExpanded(true)} className="min-w-0 flex-1 text-left">
              <h3 className="text-xs font-black truncate">{currentItem.title}</h3>
              <p className={`text-[10px] truncate mt-0.5 ${playbackError ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>{playbackError || (source?.kind === 'youtube' ? 'Official trailer • tap to resume' : isPlaying ? 'Playing now' : 'Paused')}</p>
            </button>
            <button
              onClick={() => source?.kind === 'youtube' ? setIsExpanded(true) : togglePlay()}
              className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0"
            >
              {isLoading ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : isPlaying ? <Pause size={17} className="fill-current" /> : <Play size={17} className="fill-current ml-0.5" />}
            </button>
            <button onClick={nextItem} className="icon-button"><SkipForward size={18} className="fill-current" /></button>
            <button onClick={() => setIsExpanded(true)} className="icon-button hidden sm:flex"><Settings2 size={17} /></button>
            <button onClick={() => setIsExpanded(true)} className="icon-button hidden sm:flex"><Maximize2 size={17} /></button>
          </div>
          <div className="relative z-10 border-t border-[var(--line)] bg-[var(--panel)]/45 px-2.5 pb-2.5 pt-2">
            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--line)] relative cursor-pointer" onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              seekDirectly((duration || 1) * percent);
            }}>
              <div className="h-full bg-[var(--accent)] absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
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
