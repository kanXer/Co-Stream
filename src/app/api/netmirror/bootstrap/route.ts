import { getNetMirrorConfig } from '@/lib/netmirror';

export async function GET() {
  try {
    return Response.json(await getNetMirrorConfig());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'NetMirror bootstrap failed.' }, { status: 502 });
  }
}