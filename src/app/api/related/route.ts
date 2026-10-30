import { getRelatedMedia } from '@/lib/catalog';
import type { MediaType } from '@/types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  const type: MediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  if (!id || id.length > 80) return Response.json({ results: [] });
  return Response.json({ results: await getRelatedMedia(type, id) });
}
