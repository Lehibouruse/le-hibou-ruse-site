import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hostOf(request) {
  const forwarded = request.headers.get("x-forwarded-host") || "";
  return (forwarded || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
}

export async function GET(request) {
  const host = hostOf(request);
  const canonicalHost = "d4d5d6.com";
  const response = NextResponse.json({
    ok: true,
    site: "Le Hibou Rusé",
    canonical_host: canonicalHost,
    received_host: host,
    canonical: host === canonicalHost || host === `www.${canonicalHost}`,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Hibou-Site", "le-hibou-ruse");
  return response;
}
