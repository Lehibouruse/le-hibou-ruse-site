import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hostOf(request) {
  const forwarded = request.headers.get("x-forwarded-host") || "";
  return (forwarded || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
}

export async function GET(request) {
  const host = hostOf(request);
  const canonicalHost = "le-hibou-ruse-site.vercel.app";
  const response = NextResponse.json({
    ok: true,
    site: "Le Hibou Rusé",
    canonical_host: canonicalHost,
    received_host: host,
    canonical: host === canonicalHost,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Hibou-Site", "le-hibou-ruse");
  return response;
}
