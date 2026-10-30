import { getHomeCatalog } from '@/lib/catalog';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = (searchParams.get('region') || 'IN').toUpperCase().slice(0, 2);
  const language = (searchParams.get('language') || 'hi').toLowerCase().slice(0, 5);
  const platforms = (searchParams.get('platforms') || 'Netflix,PrimeVideo')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  const requestedView = searchParams.get('view');
  const view = requestedView === 'tv' || requestedView === 'movie' ? requestedView : 'home';
  return Response.json(await getHomeCatalog(region, language, platforms, view));
}
