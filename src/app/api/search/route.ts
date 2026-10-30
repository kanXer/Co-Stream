import { searchCatalog } from '@/lib/catalog';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim().slice(0, 120);
  const requestedFilter = searchParams.get('filter');
  const filter = requestedFilter === 'movie' || requestedFilter === 'tv' ? requestedFilter : 'all';
  const region = (searchParams.get('region') || 'IN').toUpperCase().slice(0, 2);
  return Response.json(await searchCatalog(query, filter, region));
}
