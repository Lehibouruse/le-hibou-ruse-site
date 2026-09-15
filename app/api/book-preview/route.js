import { timingSafeEqual } from "node:crypto";
import { getRecords, TABLES, configMap } from "../../../lib/airtable";
import { renderBookDocument } from "../../../lib/book-renderer.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || !left.length) return false;
  return timingSafeEqual(left, right);
}

function authorized(request) {
  const expectedUser = process.env.BOOK_PREVIEW_USERNAME || "hibou";
  const expectedPassword = process.env.BOOK_PREVIEW_PASSWORD || "";
  if (!expectedPassword) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"); } catch { return false; }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), expectedUser) && safeEqual(decoded.slice(separator + 1), expectedPassword);
}

export async function GET(request) {
  if (!authorized(request)) {
    return new Response("Authentification requise", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Le Hibou Rusé — livre", charset="UTF-8"',
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const [chapters, configuration] = await Promise.all([
    getRecords(TABLES.book, { pageSize: 100 }),
    getRecords(TABLES.configuration, { pageSize: 100 }),
  ]);
  const config = configMap(configuration);
  const html = renderBookDocument({
    chapters,
    edition: config.book_current_edition || "V1.0-draft",
    generatedAt: new Date().toISOString(),
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
