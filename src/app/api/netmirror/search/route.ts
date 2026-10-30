import { searchCurrentNetMirror } from '@/lib/netmirror';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim().slice(0, 120);
  if (!query) return Response.json({ results: [] });
  try {
    const results = (await searchCurrentNetMirror(query)).map((item) => ({
      id: `tmdb:${item.type}:${item.tmdbId}`,
      title: item.title,
      type: item.type,
      year: item.year,
      poster: item.poster,
    }));
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'NetMirror search failed.', results: [] }, { status: 502 });
  }
}
