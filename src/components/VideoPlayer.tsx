'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Bookmark,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  FastForward,
  ListVideo,
  Languages,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sun,
  Settings2,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useStream, type PlaybackController } from '@/context/StreamContext';
import { OfflineButton } from '@/components/OfflineButton';
import { getOfflinePlaybackUrl, isVideoDownloaded } from '@/lib/offlineStore';
import Hls from 'hls.js';
import { getRoomFromUrl, copyCoLink, getCoChannel, type CoWatchMessage } from '@/lib/coWatch';
import type { MediaDetails, PlaybackSource } from '@/types';

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
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

export function VideoPlayer() {
  const {
    currentItem,
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
  const [playerMenu, setPlayerMenu] = useState<'settings' | 'quality' | 'subtitles' | 'audio' | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [selectedSubtitle, setSelectedSubtitle] = useState('off');
  const [selectedAudio, setSelectedAudio] = useState('Original');
  const [switchingSource, setSwitchingSource] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<'left' | 'right' | null>(null);
  const [controlPulse, setControlPulse] = useState<'play' | 'pause' | null>(null);
  const [videoFit, setVideoFit] = useState<'contain' | 'cover'>('contain');
  const [fitFeedback, setFitFeedback] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchAppliedRef = useRef(false);
  const suppressTapRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = currentItem?.id || null;
  const [coRoomId, setCoRoomId] = useState<string | null>(null);

  useEffect(() => {
    setCoRoomId(getRoomFromUrl());
  }, []);

  // Co-watch sync via BroadcastChannel (same origin)
  useEffect(() => {
    if (!coRoomId || !currentId) return;
    const channel = getCoChannel(coRoomId);
    if (!channel) return;
    const handleMessage = (ev: MessageEvent) => {
      const msg = ev.data as CoWatchMessage;
      if (msg.roomId !== coRoomId || msg.itemId !== currentId) return;
      if (msg.type === 'play') {
        // No direct force play to avoid loops; UI will reflect via shared state
      }
      if (msg.type === 'pause') {
        // noop
      }
      if (msg.type === 'seek' && typeof msg.time === 'number') {
        seek(msg.time);
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => channel.removeEventListener('message', handleMessage);
  }, [coRoomId, currentId, seek]);

  // Broadcast seek/play state for co-watch
  useEffect(() => {
    if (!coRoomId || !currentId) return;
    const channel = getCoChannel(coRoomId);
    if (!channel) return;
    const msg: CoWatchMessage = {
      type: isPlaying ? 'play' : 'pause',
      roomId: coRoomId,
      itemId: currentId,
    };
    channel.postMessage(msg);
  }, [isPlaying, coRoomId, currentId]);

  useEffect(() => {
    if (!coRoomId || !currentId) return;
    const channel = getCoChannel(coRoomId);
    if (!channel) return;
    const msg: CoWatchMessage = {
      type: 'seek',
      time: currentTime,
      roomId: coRoomId,
      itemId: currentId,
    };
    // throttle by not sending every frame; rely on seek actions
    channel.postMessage(msg);
  }, [currentTime, coRoomId, currentId]);

  // Resolve playback details. Catalog responses intentionally contain metadata
  // only; the title endpoint supplies the current signed playback source.
  useEffect(() => {
    if (!currentItem) {
      setSource(null);
      setDirectUrl(null);
      return;
    }

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
    const isLegacyNetMirrorHls = isNetMirror && Boolean(
      itemAtStart.playback?.mimeType?.includes('mpegurl')
      || itemAtStart.playback?.url?.includes('net52.cc'),
    );
    const isFreshNetMirrorPlayback = Boolean(
      itemAtStart.playback?.resolvedAt
      && Date.now() - itemAtStart.playback.resolvedAt < 2 * 60 * 1000,
    );
    const canReusePlayback = Boolean(itemAtStart.playback) && !isLegacyNetMirrorHls && (
      !isNetMirror
      || isFreshNetMirrorPlayback
      || !navigator.onLine
    );
    if (canReusePlayback) {
      applySource(itemAtStart.playback);
    } else {
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
      fetch(resolveUrl)
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'Could not resolve playback.');
          return payload as MediaDetails;
        })
        .then((details) => {
          if (!active) return;
          resolveCurrentItem(details);
          return applySource(details.playback);
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

    return () => { active = false; };
    // Playback must only be re-resolved when the selected title changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [currentId]);

  useEffect(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowControls(true);
    if (isPlaying && isExpanded) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3200);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isPlaying, isExpanded, currentId]);

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

  // Native direct-video controller.
  useEffect(() => {
    if (source?.kind !== 'direct' || !directUrl || !videoRef.current || !currentItem) return;
    const video = videoRef.current;
    const resumeAt = pendingSeekRef.current ?? watchProgress[currentItem.id]?.position ?? 0;
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
      video.play().catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
    };

    if (isHls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Start at 480p so the first fragment arrives quickly; ABR upgrades
        // once the buffer is healthy.
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 6,
      });
      hlsInstance.loadSource(directUrl);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resumeAt > 2 && resumeAt < (video.duration || currentItem.durationSeconds) - 5) video.currentTime = resumeAt;
        pendingSeekRef.current = null;
        reportPlayback({ duration: video.duration || currentItem.durationSeconds, isLoading: false, error: null });
        video.volume = volume;
        video.play().catch(() => reportPlayback({ isPlaying: false, isLoading: false }));
      });
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) reportPlayback({ isLoading: false, isPlaying: false, error: 'This HLS stream could not be played.' });
      });
    } else if (isHls) {
      video.src = directUrl;
    }
    const onTime = () => {
      reportPlayback({ currentTime: video.currentTime, duration: video.duration || currentItem.durationSeconds });
      updateWatchProgress(currentItem.id, video.currentTime, video.duration || currentItem.durationSeconds);
    };
    const onPlay = () => {
      video.muted = volume === 0;
      video.volume = volume;
      reportPlayback({ isPlaying: true, isLoading: false, error: null });
    };
    const onPause = () => reportPlayback({ isPlaying: false });
    const onWaiting = () => {
      reportPlayback({ isLoading: true });
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (video.readyState < 3) fallBackQuality();
      }, 4500);
    };
    const onCanPlay = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      reportPlayback({ isLoading: false });
    };
    const onError = () => {
      if (!fallBackQuality()) reportPlayback({ isLoading: false, isPlaying: false, error: 'This video could not be played.' });
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
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
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', onError);
      if (stallTimer) clearTimeout(stallTimer);
      video.pause();
      hlsInstance?.destroy();
      registerController(null);
    };
    // The initial resume point and volume are intentionally snapshotted when a
    // source opens; progress updates must not recreate the media element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, directUrl, currentId, handleEnded, registerController, reportPlayback, updateWatchProgress]);

  // Official YouTube IFrame player for TMDB trailers.
  useEffect(() => {
    if (source?.kind !== 'youtube' || !source.videoId || !youtubeContainerRef.current || !currentItem) return;
    let active = true;
    const itemAtStart = currentItem;
    const resumeAt = watchProgress[itemAtStart.id]?.position || 0;

    loadYouTubeApi().then((YT) => {
      if (!active || !youtubeContainerRef.current) return;
      youtubePlayerRef.current = new YT.Player(youtubeContainerRef.current, {
        videoId: source.videoId!,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (!active) return;
            target.setVolume(volume * 100);
            if (resumeAt > 2) target.seekTo(resumeAt, true);
            target.playVideo();
            reportPlayback({ isLoading: false, error: null });
          },
          onStateChange: ({ data, target }) => {
            if (!active) return;
            if (data === 1) reportPlayback({ isPlaying: true, isLoading: false });
            if (data === 2) reportPlayback({ isPlaying: false });
            if (data === 3) reportPlayback({ isLoading: true });
            if (data === 0) handleEnded();
            const total = target.getDuration() || itemAtStart.durationSeconds;
            if (total) reportPlayback({ duration: total });
          },
          onError: () => reportPlayback({ isPlaying: false, isLoading: false, error: 'The official trailer is restricted from embedded playback.' }),
        },
      });

      const controller: PlaybackController = {
        play: () => youtubePlayerRef.current?.playVideo(),
        pause: () => youtubePlayerRef.current?.pauseVideo(),
        seek: (seconds) => youtubePlayerRef.current?.seekTo(seconds, true),
        setVolume: (nextVolume) => youtubePlayerRef.current?.setVolume(nextVolume * 100),
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
    // As above, live progress is reported from the ticker and must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, currentId, handleEnded, registerController, reportPlayback, updateWatchProgress]);

  // Embedded trailers stay visible while playing. Minimizing pauses YouTube rather
  // than turning the iframe into a hidden background-audio workaround.
  useEffect(() => {
    if (!isExpanded && source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
  }, [isExpanded, source]);

  useEffect(() => {
    const onFullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setIsBrowserFullscreen(active);
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: string) => Promise<void>;
      };
      if (active) orientation.lock?.('landscape').catch(() => undefined);
      else orientation.unlock?.();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
  }, []);

  if (!currentItem) return null;

  const saved = isWatchlisted(currentItem.id);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const background = currentItem.backdropUrl || currentItem.posterUrl;
  const selectedSubtitleLabel = selectedSubtitle === 'off'
    ? 'Off'
    : source?.subtitles?.find((track) => track.id === selectedSubtitle)?.label || 'On';

  const revealControls = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setPlayerMenu(null);
      }, 3200);
    }
  };

  const chooseQuality = (label: string, url: string) => {
    pendingSeekRef.current = videoRef.current?.currentTime || currentTime;
    setSelectedQuality(label);
    setPlayerMenu(null);
    setDirectUrl(url);
    revealControls();
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

  const animatedTogglePlay = () => {
    setControlPulse(isPlaying ? 'pause' : 'play');
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setControlPulse(null), 520);
    togglePlay();
    revealControls();
  };

  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  };

  const applyVideoFit = (fit: 'contain' | 'cover') => {
    setVideoFit(fit);
    setFitFeedback(fit === 'cover' ? 'Zoomed to fill' : 'Fit to screen');
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => setFitFeedback(null), 900);
  };

  const handleStageTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    revealControls();
    if (event.touches.length !== 2) return;
    suppressTapRef.current = true;
    pinchDistanceRef.current = touchDistance(event.touches);
    pinchAppliedRef.current = false;
    lastTapRef.current = null;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
  };

  const handleStageTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchDistanceRef.current || pinchAppliedRef.current) return;
    event.preventDefault();
    const ratio = touchDistance(event.touches) / pinchDistanceRef.current;
    if (ratio > 1.12) {
      applyVideoFit('cover');
      pinchAppliedRef.current = true;
    } else if (ratio < 0.88) {
      applyVideoFit('contain');
      pinchAppliedRef.current = true;
    }
  };

  const handleStageTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) return;
    pinchDistanceRef.current = null;
    pinchAppliedRef.current = false;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => { suppressTapRef.current = false; }, 450);
  };

  const handleStageTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,input,label')) return;
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const side: 'left' | 'right' = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right';
    const now = event.timeStamp;
    const previous = lastTapRef.current;

    if (previous && previous.side === side && now - previous.at < 320) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      lastTapRef.current = null;
      const position = videoRef.current?.currentTime ?? currentTime;
      seek(position + (side === 'left' ? -10 : 10));
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

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await stageRef.current?.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (value: string) => Promise<void>;
        };
        await orientation.lock?.('landscape').catch(() => undefined);
      } catch {
        const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        video?.webkitEnterFullscreen?.();
      }
    } else {
      screen.orientation.unlock?.();
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const minimize = () => {
    if (source?.kind === 'youtube') youtubePlayerRef.current?.pauseVideo();
    setIsExpanded(false);
  };

  return (
    <>
      {/* Persistent engine. In mini mode it remains mounted but direct-video audio can continue. */}
      <div className={isExpanded ? 'watch-shell fixed inset-0 z-[70] overflow-y-auto no-scrollbar' : 'fixed -left-[9999px] top-0 w-px h-px overflow-hidden'}>
        {isExpanded && background && (
          <div className="watch-backdrop fixed inset-0 pointer-events-none">
            <Image src={background} alt="" fill sizes="100vw" className="watch-backdrop-image object-cover scale-110 blur-3xl" />
            <div className="watch-backdrop-shade absolute inset-0" />
          </div>
        )}

        <div className={isExpanded ? 'relative min-h-screen flex flex-col' : ''}>
          {isExpanded && (
            <header className="watch-header sticky top-0 z-20 flex items-center justify-between px-4 sm:px-7 py-4">
              <button onClick={minimize} className="player-icon"><ChevronDown size={21} /></button>
              <div className="text-center min-w-0 px-3"><p className="watch-accent text-[9px] uppercase tracking-[0.2em] font-black">Now watching</p><p className="watch-muted text-xs font-bold truncate max-w-[52vw]">{currentItem.title}</p></div>
              <div className="flex gap-2"><button onClick={() => setShowQueue(!showQueue)} className={`player-icon ${showQueue ? 'active' : ''}`}><ListVideo size={19} /></button><button onClick={toggleFullscreen} className="player-icon">{isBrowserFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
            </header>
          )}

          <main className={isExpanded ? 'watch-main relative flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-7 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5' : ''}>
            <div className="min-w-0">
              <div
                ref={stageRef}
                onMouseMove={revealControls}
                onTouchStart={handleStageTouchStart}
                onTouchMove={handleStageTouchMove}
                onTouchEnd={handleStageTouchEnd}
                onClick={handleStageTap}
                className={isExpanded ? `player-stage relative aspect-video w-full rounded-2xl sm:rounded-[26px] overflow-hidden bg-black shadow-[0_30px_90px_rgba(0,0,0,.55)] border border-white/10 select-none ${showControls ? 'cursor-default' : 'cursor-none'}` : 'w-px h-px'}
              >
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
                    className={`w-full h-full bg-black transition-[object-fit] duration-300 ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                  >
                    {(source.subtitles || []).map((track) => (
                      <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />
                    ))}
                  </video>
                )}
                {source?.kind === 'youtube' && (
                  <div key={`${currentItem.id}-${source.videoId}`} ref={youtubeContainerRef} className="w-full h-full" />
                )}
                {!source && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                    {isLoading ? <span className="w-9 h-9 rounded-full border-3 border-[#7fffd2] border-t-transparent animate-spin" /> : <Play size={32} className="text-white/25" />}
                    <p className="text-sm font-bold text-white/70">{isLoading ? 'Preparing playback…' : playbackError || 'No playback source available.'}</p>
                  </div>
                )}

                {isExpanded && source?.kind === 'direct' && directUrl && (
                  <div className={`absolute inset-0 z-10 transition-opacity duration-200 pointer-events-none ${showControls || playerMenu ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 to-transparent" />
                    <div className="player-controls-top absolute inset-x-0 top-0 p-4 sm:p-5 flex items-start justify-between gap-4">
                      <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.18em] font-bold text-white/55">Now playing</p><p className="mt-1 text-sm sm:text-base font-bold text-white truncate max-w-[70vw]">{currentItem.title}</p></div>
                      <div className="pointer-events-auto flex items-center gap-1.5">
                        <span className="rounded-md bg-black/55 px-2 py-1 text-[10px] font-black text-white/80">{selectedQuality}</span>
                        {selectedAudio !== 'Original' && <span className="hidden sm:inline rounded-md bg-black/55 px-2 py-1 text-[10px] font-black text-[#7fffd2]">{selectedAudio}</span>}
                        <button onClick={() => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); setShowControls(true); setPlayerMenu(playerMenu === 'settings' ? null : 'settings'); }} className={`player-control-icon !rounded-full bg-black/45 ${playerMenu ? '!bg-white/15' : ''}`} title="Player settings"><Settings2 size={21} /></button>
                      </div>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center gap-5 sm:gap-8">
                      <button onClick={() => { seek(currentTime - 10); revealControls(); }} className="pointer-events-auto relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md"><Rewind size={22} /><span className="absolute text-[8px] font-black">10</span></button>
                      <button onClick={animatedTogglePlay} disabled={switchingSource} className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-2xl transition-transform active:scale-90 disabled:opacity-60">
                        {isLoading || switchingSource ? <span className="w-7 h-7 rounded-full border-3 border-black/25 border-t-black animate-spin" /> : isPlaying ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1" />}
                      </button>
                      <button onClick={() => { seek(currentTime + 10); revealControls(); }} className="pointer-events-auto relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md"><FastForward size={22} /><span className="absolute text-[8px] font-black">10</span></button>
                    </div>

                    <div className="player-controls-bottom absolute inset-x-0 bottom-0 pt-20 pb-3 sm:pb-4 px-3 sm:px-5 bg-gradient-to-t from-black/90 via-black/55 to-transparent">
                      <input
                        aria-label="Seek video"
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="0.1"
                        value={Math.min(currentTime, duration || 100)}
                        onChange={(event) => seek(Number(event.target.value))}
                        className="co-slider pointer-events-auto w-full"
                        style={{ '--fill': `${progress}%` } as React.CSSProperties}
                      />
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto">
                          <button onClick={animatedTogglePlay} className="player-control-icon">{isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current" />}</button>
                          <label className="hidden sm:flex items-center gap-2 px-2 text-white/80"><Volume2 size={19} /><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-20 accent-white" /></label>
                          <span className="text-[10px] sm:text-xs font-medium text-white/80 tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 sm:gap-1 pointer-events-auto">
                          <button onClick={toggleFullscreen} className="player-control-icon" title="Fullscreen">{isBrowserFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button>
                        </div>
                      </div>
                    </div>

                    {playerMenu && (
                      <div className="pointer-events-auto absolute right-3 sm:right-5 top-14 sm:top-16 w-64 max-h-[72%] overflow-y-auto rounded-xl border border-white/15 bg-[#111]/96 p-1.5 shadow-2xl backdrop-blur-2xl">
                        <div className="flex items-center gap-1 px-1 py-1">
                          {playerMenu !== 'settings' && <button onClick={() => setPlayerMenu('settings')} className="player-control-icon !w-8 !h-8"><ChevronLeft size={18} /></button>}
                          <p className="px-2 py-2 text-[10px] uppercase tracking-[.16em] font-black text-white/45">{playerMenu === 'settings' ? 'Player settings' : playerMenu === 'quality' ? 'Quality' : playerMenu === 'subtitles' ? 'Subtitle language' : 'Audio language'}</p>
                        </div>
                        {playerMenu === 'settings' && <>
                          <button onClick={() => source.qualities?.length && setPlayerMenu('quality')} disabled={!source.qualities?.length} className="player-menu-option disabled:opacity-40"><span className="flex items-center gap-2"><Settings2 size={16} />Quality</span><span className="flex items-center gap-1 text-white/45">{source.qualities?.length ? selectedQuality : 'Unavailable'}<ChevronRight size={15} /></span></button>
                          <button onClick={() => source.subtitles?.length && setPlayerMenu('subtitles')} disabled={!source.subtitles?.length} className="player-menu-option disabled:opacity-40"><span className="flex items-center gap-2"><Captions size={17} />Subtitles</span><span className="flex items-center gap-1 text-white/45">{source.subtitles?.length ? selectedSubtitleLabel : 'Unavailable'}<ChevronRight size={15} /></span></button>
                          <button onClick={() => source.audioTracks?.length && setPlayerMenu('audio')} disabled={!source.audioTracks?.length} className="player-menu-option disabled:opacity-40"><span className="flex items-center gap-2"><Languages size={17} />Audio</span><span className="flex items-center gap-1 text-white/45">{selectedAudio}<ChevronRight size={15} /></span></button>
                          <button onClick={() => { applyVideoFit(videoFit === 'contain' ? 'cover' : 'contain'); setPlayerMenu(null); }} className="player-menu-option"><span className="flex items-center gap-2"><Maximize2 size={16} />Aspect ratio</span><span className="text-white/45">{videoFit === 'cover' ? 'Fill' : 'Fit'}</span></button>
                        </>}
                        {playerMenu === 'quality' && source.qualities?.map((quality) => (
                          <button key={`${quality.label}-${quality.url}`} onClick={() => chooseQuality(quality.label, quality.url)} className="player-menu-option"><span>{quality.label}</span>{selectedQuality === quality.label && <Check size={15} className="text-[#7fffd2]" />}</button>
                        ))}
                        {playerMenu === 'subtitles' && <>
                          <button onClick={() => { setSelectedSubtitle('off'); setPlayerMenu(null); }} className="player-menu-option"><span>Off</span>{selectedSubtitle === 'off' && <Check size={15} className="text-[#7fffd2]" />}</button>
                          {source.subtitles?.map((track) => <button key={track.id} onClick={() => { setSelectedSubtitle(track.id); setPlayerMenu(null); }} className="player-menu-option"><span>{track.label}</span>{selectedSubtitle === track.id && <Check size={15} className="text-[#7fffd2]" />}</button>)}
                        </>}
                        {playerMenu === 'audio' && source.audioTracks?.map((track) => (
                          <button key={track.id} onClick={() => void chooseAudio(track.resolveUrl)} className="player-menu-option"><span>{track.label}</span>{selectedAudio === track.label && <Check size={15} className="text-[#7fffd2]" />}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {playbackError && source && <div className="absolute left-1/2 top-5 -translate-x-1/2 z-20 rounded-full bg-red-500/90 px-4 py-2 text-xs font-bold text-white shadow-xl">{playbackError}</div>}
                {seekFeedback && (
                  <div className={`player-seek-feedback pointer-events-none absolute inset-y-0 z-30 w-1/2 flex items-center justify-center ${seekFeedback === 'left' ? 'left-0' : 'right-0'}`}>
                    <div className="flex flex-col items-center gap-2 text-white drop-shadow-xl">
                      <span className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center">{seekFeedback === 'left' ? <Rewind size={30} /> : <FastForward size={30} />}</span>
                      <span className="text-xs font-black">10 seconds</span>
                    </div>
                  </div>
                )}
                {controlPulse && (
                  <div className="player-control-pulse pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                    <span className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white">{controlPulse === 'play' ? <Play size={34} className="fill-current ml-1" /> : <Pause size={34} className="fill-current" />}</span>
                  </div>
                )}
                {fitFeedback && (
                  <div className="player-fit-feedback pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-4 py-2 text-xs font-black text-white backdrop-blur-md">{fitFeedback}</div>
                )}
              </div>

              {isExpanded && (
                <div className="watch-glass mt-3 flex items-center justify-between gap-3 flex-wrap rounded-2xl px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button onClick={previousItem} className="player-pill"><SkipBack size={14} />Previous</button>
                    <button onClick={nextItem} className="player-pill">Next<SkipForward size={14} /></button>
                  </div>
                  <div className="flex items-center justify-center flex-wrap gap-2">
                    <button onClick={toggleShuffle} className={`player-pill ${shuffle ? 'active' : ''}`}><Shuffle size={14} />Shuffle</button>
                    <button onClick={cycleRepeatMode} className={`player-pill ${repeatMode !== 'OFF' ? 'active' : ''}`}>{repeatMode === 'ONE' ? <Repeat1 size={14} /> : <Repeat size={14} />}{repeatMode === 'ONE' ? 'Repeat one' : repeatMode === 'ALL' ? 'Repeat all' : 'Repeat'}</button>
                    <button onClick={() => setShowTimer(true)} className={`player-pill ${sleepTimerMinutes ? 'active' : ''}`}><Clock3 size={14} />{sleepTimerMinutes ? formatTime(sleepRemainingSeconds) : 'Timer'}</button>
                  </div>
                </div>
              )}
            </div>

            {isExpanded && (
              <aside className="min-w-0">
                <div className="watch-glass rounded-[26px] p-5 lg:sticky lg:top-24">
                  <div className="flex items-start gap-3.5">
                    <div className="watch-poster relative w-16 h-24 rounded-xl overflow-hidden shrink-0">{currentItem.posterUrl && <Image src={currentItem.posterUrl} alt={currentItem.title} fill sizes="64px" className="object-cover" />}</div>
                    <div className="min-w-0 pt-1"><p className="watch-accent text-[9px] uppercase tracking-[.18em] font-black">{source?.label || 'Co Stream'}{selectedAudio !== 'Original' ? ` • ${selectedAudio}` : ''}</p><h2 className="text-lg font-black leading-tight mt-1 line-clamp-2">{currentItem.title}</h2><p className="watch-muted text-[11px] mt-1">{currentItem.year} • {currentItem.genres.slice(0, 2).join(' • ')}</p></div>
                  </div>
                  <p className="watch-muted mt-4 text-xs leading-6 line-clamp-5">{currentItem.overview}</p>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    <button onClick={() => toggleWatchlist(currentItem)} className={`player-action ${saved ? 'active' : ''}`}><Bookmark size={17} className={saved ? 'fill-current' : ''} /><span>Save</span></button>
                    <div className="player-action"><OfflineButton item={currentItem} source={source} compact /><span>Offline</span></div>
                    <button onClick={share} className="player-action"><Share2 size={17} /><span>Share</span></button>
                    <button onClick={cycleThemeMode} className="player-action">{themeMode === 'DARK' ? <Sun size={17} /> : <Moon size={17} />}<span>Theme</span></button>
                  </div>
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        const room = coRoomId || Math.random().toString(36).slice(2, 8);
                        setCoRoomId(room);
                        copyCoLink(room);
                        alert('Co-watch link copied. Share it with friends to sync playback in this room.');
                      }}
                      className={`player-action watch-wide-action w-full ${coRoomId ? 'active' : ''}`}
                      title="Start or copy co-watch room link"
                    >
                      <Users size={17} /><span>{coRoomId ? 'Co-watch' : 'Start Co-watch'}</span>
                    </button>
                  </div>

                  {(showQueue || queue.length > 1) && (
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

      {!isExpanded && (
        <div className="fixed left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[620px] z-40 bottom-[calc(4.55rem+env(safe-area-inset-bottom,0px))] rounded-2xl border border-[var(--line)] bg-[var(--panel-elevated)]/95 backdrop-blur-2xl shadow-[0_14px_45px_rgba(0,0,0,.3)] overflow-hidden">
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
            <button onClick={() => setIsExpanded(true)} className="icon-button hidden sm:flex"><Expand size={17} /></button>
          </div>
          <div className="px-2.5 pb-2.5 pt-0.5">
            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--line)] relative cursor-pointer" onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              seek((duration || 1) * percent);
            }}>
              <div className="h-full bg-[var(--accent)] absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {showTimer && (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-md flex items-center justify-center p-5" onClick={() => setShowTimer(false)}>
          <div className="watch-dialog w-full max-w-xs rounded-[26px] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><p className="watch-accent text-[9px] uppercase tracking-[.17em] font-black">Playback</p><h3 className="font-black mt-0.5">Sleep timer</h3></div><button onClick={() => setShowTimer(false)} className="icon-button"><X size={17} /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[5, 10, 15, 30, 45, 60].map((minutes) => (
                <button key={minutes} onClick={() => { setSleepTimer(minutes); setShowTimer(false); }} className={`watch-timer-option py-3 rounded-2xl border text-xs font-bold ${sleepTimerMinutes === minutes ? 'active' : ''}`}>{minutes} minutes</button>
              ))}
            </div>
            {sleepTimerMinutes && <button onClick={() => { setSleepTimer(null); setShowTimer(false); }} className="w-full mt-3 py-3 rounded-2xl bg-red-500/10 text-red-300 text-xs font-bold">Turn timer off</button>}
          </div>
        </div>
      )}
    </>
  );
}
