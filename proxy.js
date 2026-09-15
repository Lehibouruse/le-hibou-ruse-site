import { NextResponse } from "next/server";
import { canonicalRedirectUrl, shouldCanonicalRedirect } from "./lib/canonical-domain.mjs";

export function proxy(request) {
  const host = request.headers.get("host") || "";
  const accept = request.headers.get("accept") || "";
  if (!shouldCanonicalRedirect({ host, method: request.method, accept })) {
    return NextResponse.next();
  }

  return NextResponse.redirect(canonicalRedirectUrl(request.url), 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
