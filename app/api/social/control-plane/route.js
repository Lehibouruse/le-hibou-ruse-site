import { adminOrServiceAuthorized, serviceUnauthorized } from "../../../../lib/admin-auth.mjs";
import { socialControlPlaneSnapshot, syncSocialControlPlaneToAirtable } from "../../../../lib/social-control-plane.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!adminOrServiceAuthorized(request)) return serviceUnauthorized();
  try {
    const snapshot = await socialControlPlaneSnapshot();
    return Response.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request) {
  if (!adminOrServiceAuthorized(request)) return serviceUnauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action !== "sync_airtable") {
      return Response.json({ ok: false, error: "action non prise en charge" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const snapshot = await socialControlPlaneSnapshot();
    const airtable = await syncSocialControlPlaneToAirtable(snapshot);
    return Response.json({ ok: true, summary: snapshot.summary, airtable, safety: snapshot.safety }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
