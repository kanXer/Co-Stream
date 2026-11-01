import { getCurrentNetMirrorSeason, proxiedMediaPath } from '@/lib/netmirror';

// Upstream season metadata fetch uses 20s timeouts.
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const catalogId = Number(searchParams.get('catalogId'));
  const season = Math.max(1, Math.min(100, Number(searchParams.get('season')) || 1));

  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return Response.json({ error: 'A valid NetMirror catalog id is required.' }, { status: 400 });
  }

  try {
    const payload = await getCurrentNetMirrorSeason(catalogId, season);
    if (!payload.ok) throw new Error('This season is not available.');
    return Response.json({
      season: Number(payload.season) || season,
      name: payload.name || `Season ${season}`,
      overview: payload.overview || '',
      episodes: (payload.episodes || []).map((entry) => ({
        number: Number(entry.episode) || 0,
        name: entry.name || `Episode ${entry.episode}`,
        overview: entry.overview || '',
        stillUrl: entry.still ? proxiedMediaPath(entry.still) : null,
        runtimeMinutes: Number(entry.runtime) || 0,
        airDate: entry.airDate || '',
        rating: Number(entry.rating) || 0,
      })).filter((entry) => entry.number > 0),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not load this season.' },
      { status: 502 },
    );
  }
}
