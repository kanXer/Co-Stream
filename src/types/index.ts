export type MediaType = 'movie' | 'tv';
export type ThemeMode = 'DARK' | 'LIGHT' | 'SYSTEM';
export type RepeatMode = 'OFF' | 'ALL' | 'ONE';

export interface PlaybackQuality {
  label: string;
  url: string;
}

export interface PlaybackSubtitle {
  id: string;
  label: string;
  language: string;
  url: string;
}

export interface PlaybackAudioTrack {
  id: string;
  label: string;
  resolveUrl: string;
}

export interface PlaybackSource {
  kind: 'direct' | 'youtube';
  label: string;
  url?: string;
  downloadUrl?: string;
  videoId?: string;
  mimeType?: string;
  downloadable?: boolean;
  qualities?: PlaybackQuality[];
  subtitles?: PlaybackSubtitle[];
  audioTracks?: PlaybackAudioTrack[];
  selectedQuality?: string;
  selectedAudio?: string;
  resolvedAt?: number;
}

export interface MediaSeason {
  number: number;
  name: string;
  episodeCount: number;
}

export interface MediaEpisode {
  number: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  runtimeMinutes: number;
  airDate: string;
  rating: number;
}

export interface MediaItem {
  /** Stable app identifier for a NetMirror catalog item. */
  id: string;
  /** Identifier understood by the active metadata provider. */
  providerId: string;
  mediaType: MediaType;
  title: string;
  tagline?: string;
  overview: string;
  year: string;
  rating: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres?: string[];
  durationSeconds: number;
  language: string;
  seasonCount?: number;
  episodeCount?: number;
  catalogId?: number;
  selectedSeason?: number;
  selectedEpisode?: number;
  seasons?: MediaSeason[];
  episodes?: MediaEpisode[];
  cast?: string[];
  playback?: PlaybackSource | null;
  related?: MediaItem[];
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle: string;
  items: MediaItem[];
}

export interface MediaDetails extends MediaItem {
  related?: MediaItem[];
}

export interface UserCollection {
  id: string;
  title: string;
  items: MediaItem[];
  createdAt: number;
}

export interface WatchProgress {
  position: number;
  duration: number;
  updatedAt: number;
}

export interface CatalogPayload {
  mode: 'netmirror';
  sections: HomeSection[];
  spotlight?: MediaItem[];
  notice?: string;
}
