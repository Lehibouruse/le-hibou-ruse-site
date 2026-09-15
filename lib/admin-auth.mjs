import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function adminAuthorized(request, env = process.env) {
  const expectedUser = String(env.HIBOU_ADMIN_USER || "hibou");
  const expectedPassword = String(env.HIBOU_ADMIN_PASSWORD || "");
  if (!expectedPassword) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"); } catch { return false; }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), expectedUser)
    && safeEqual(decoded.slice(separator + 1), expectedPassword);
}

export function adminUnauthorized() {
  return new Response("Authentification administrateur requise", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Le Hibou Rusé — Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
