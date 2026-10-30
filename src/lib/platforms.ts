export const STREAMING_PLATFORMS = [
  { id: 'Netflix', label: 'Netflix', shortLabel: 'N', color: '#e50914' },
  { id: 'PrimeVideo', label: 'Amazon Prime', shortLabel: 'prime', color: '#00a8e1' },
  { id: 'JioHotstar', label: 'JioHotstar', shortLabel: 'JH', color: '#2b6def' },
  { id: 'SonyLIV', label: 'SonyLIV', shortLabel: 'SL', color: '#9b5de5' },
  { id: 'AppleTV', label: 'Apple TV+', shortLabel: 'tv+', color: '#111827' },
  { id: 'Crunchyroll', label: 'Crunchyroll', shortLabel: 'CR', color: '#f47521' },
  { id: 'MX', label: 'Amazon MX Player', shortLabel: 'MX', color: '#0085f6' },
] as const;

export type StreamingPlatformId = (typeof STREAMING_PLATFORMS)[number]['id'];

export const DEFAULT_STREAMING_PLATFORMS: StreamingPlatformId[] = ['Netflix', 'PrimeVideo'];

export function isStreamingPlatformId(value: string): value is StreamingPlatformId {
  return STREAMING_PLATFORMS.some((platform) => platform.id === value);
}

export function platformLabel(id: string) {
  return STREAMING_PLATFORMS.find((platform) => platform.id === id)?.label || id;
}
