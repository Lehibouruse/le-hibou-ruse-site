import { getRecord } from '../../../../lib/airtable';

// Stable canonical Airtable IDs. No caller-controlled URL and no generated replacement mascot.
const POSES = { revele: 'recjJfuBAT0AM7Qvd', explique: 'recJHa4TgrZ2rnMSw', pointe: 'recGk8ZTIEPvMs9Ap' };
const TABLE = 'tblQKEx1rd01bRGMn';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request, { params }) {
  const { pose } = await params;
  if (!Object.hasOwn(POSES, pose)) return new Response('Not found', { status: 404 });
  try {
    const record = await getRecord(TABLE, POSES[pose]);
    const image = record.fields?.Image?.[0];
    const url = new URL(image?.thumbnails?.large?.url || image?.url || '');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.airtableusercontent.com')) throw new Error('Invalid asset host');
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
    if (!upstream.ok) throw new Error('Asset unavailable');
    const type = upstream.headers.get('content-type') || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].some((value) => type.startsWith(value))) throw new Error('Invalid asset type');
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 5_000_000) throw new Error('Asset too large');
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Asset temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
