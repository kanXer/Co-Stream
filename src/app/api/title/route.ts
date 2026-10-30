import { getMediaDetails } from '@/lib/catalog';
import type { MediaType } from '@/types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  const type: MediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  if (!id || id.length > 80) {
    return Response.json({ error: 'A valid title id is required.' }, { status: 400 });
  }

  const details = await getMediaDetails(type, id);
  if (!details) {
    return Response.json({ error: 'Title not found or metadata provider unavailable.' }, { status: 404 });
  }
  return Response.json(details);
}
