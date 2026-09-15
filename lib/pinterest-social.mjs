import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { loadSocialCredential, storeSocialCredential } from "./social-credential-vault.mjs";

const API = "https://api.pinterest.com/v5";
const OAUTH = "https://www.pinterest.com/oauth/";
const TOKEN = `${API}/oauth/token`;
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;

function clean(value) { return String(value ?? "").trim(); }
function baseUrl(env = process.env) { return new URL(clean(env.HIBOU_PUBLIC_BASE_URL) || "https://d4d5d6.com").origin; }
function redirectUri(env = process.env) { return `${baseUrl(env)}/api/social/oauth/pinterest/callback`; }
function secret(env = process.env) {
  const value = clean(env.HIBOU_SOCIAL_VAULT_KEY);
  if (!value) throw new Error("HIBOU_SOCIAL_VAULT_KEY absent");
  return value;
}
function stateSignature(payload, env) { return createHmac("sha256", secret(env)).update(payload).digest("base64url"); }
function makeState(env = process.env) {
  const payload = Buffer.from(JSON.stringify({ ts: Date.now(), nonce: randomBytes(18).toString("base64url") })).toString("base64url");
  return `${payload}.${stateSignature(payload, env)}`;
}
function verifyState(value, env = process.env) {
  const [payload, signature] = clean(value).split(".");
  if (!payload || !signature) throw new Error("Pinterest OAuth state invalide");
  const expected = stateSignature(payload, env);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Pinterest OAuth state signature invalide");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!data.ts || Date.now() - Number(data.ts) > 15 * 60 * 1000) throw new Error("Pinterest OAuth state expiré");
}
function app(env = process.env) {
  const id = clean(env.PINTEREST_APP_ID); const appSecret = clean(env.PINTEREST_APP_SECRET);
  if (!id || !appSecret) throw new Error("PINTEREST_APP_ID/PINTEREST_APP_SECRET absents");
  return { id, secret: appSecret };
}
function scopes(env = process.env) {
  return clean(env.PINTEREST_OAUTH_SCOPES) || "boards:read,boards:write,pins:read,pins:write,user_accounts:read";
}
function basic(env = process.env) {
  const cfg = app(env);
  return `Basic ${Buffer.from(`${cfg.id}:${cfg.secret}`, "utf8").toString("base64")}`;
}
async function json(response, label) {
  const text = await response.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { text: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`${label} ${response.status}: ${data.message || data.error || data.text || response.statusText}`);
  return data;
}
async function tokenRequest(fields, env = process.env) {
  const response = await fetch(TOKEN, {
    method: "POST", headers: { Authorization: basic(env), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.entries(fields).filter(([, value]) => clean(value)).map(([key, value]) => [key, String(value)])), cache: "no-store",
  });
  return json(response, "Pinterest OAuth");
}

export function buildPinterestAuthorization(env = process.env) {
  const cfg = app(env);
  const params = new URLSearchParams({ client_id: cfg.id, redirect_uri: redirectUri(env), response_type: "code", scope: scopes(env), state: makeState(env) });
  return { provider: "pinterest", url: `${OAUTH}?${params}`, redirect_uri: redirectUri(env), scopes: scopes(env) };
}

export async function completePinterestAuthorization({ code, state }, env = process.env) {
  verifyState(state, env);
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(env) }, env);
  if (!token.access_token) throw new Error("Pinterest OAuth sans access_token");
  const payload = { env: { PINTEREST_ACCESS_TOKEN: token.access_token, PINTEREST_REFRESH_TOKEN: token.refresh_token || "" } };
  await storeSocialCredential({
    provider: "pinterest", payload, scopes: token.scope || scopes(env),
    expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
    status: "Connected",
  }, env);
  return { provider: "pinterest", scopes: token.scope || scopes(env) };
}

async function resolvePinterest(env = process.env) {
  const direct = clean(env.PINTEREST_ACCESS_TOKEN);
  if (direct) return { token: direct, source: "environment", scopes: scopes(env) };
  let credential = await loadSocialCredential("pinterest", "primary", env);
  if (!credential) return { token: "", source: "none", scopes: "" };
  let current = credential.payload?.env || {};
  const expires = credential.expiresAt ? Date.parse(credential.expiresAt) : Infinity;
  if (Number.isFinite(expires) && expires - Date.now() <= 10 * 60 * 1000) {
    if (!clean(current.PINTEREST_REFRESH_TOKEN)) throw new Error("Pinterest refresh token absent");
    const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: current.PINTEREST_REFRESH_TOKEN }, env);
    current = {
      ...current,
      PINTEREST_ACCESS_TOKEN: refreshed.access_token,
      PINTEREST_REFRESH_TOKEN: refreshed.refresh_token || current.PINTEREST_REFRESH_TOKEN,
    };
    await storeSocialCredential({
      provider: "pinterest", payload: { ...credential.payload, env: current }, scopes: refreshed.scope || credential.scopes,
      expiresAt: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : credential.expiresAt,
      status: "Connected",
    }, env);
    credential = { ...credential, payload: { ...credential.payload, env: current } };
  }
  return { token: clean(current.PINTEREST_ACCESS_TOKEN), source: "encrypted_vault", scopes: credential.scopes || "" };
}
function auth(token) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }; }

export async function pinterestStatus(env = process.env) {
  try {
    const resolved = await resolvePinterest(env);
    return {
      provider: "pinterest", configured: Boolean(resolved.token), mode: resolved.token ? "direct" : "unconfigured",
      direct_configured: Boolean(resolved.token), webhook_configured: Boolean(clean(env.HIBOU_SOCIAL_PINTEREST_WEBHOOK_URL)),
      credential_source: resolved.source, credential_scopes: resolved.scopes,
      direct_capabilities: ["image_pin", "video_pin", "boards", "analytics"],
      live_publish_supported: Boolean(resolved.token),
      missing_direct_env: resolved.token ? [] : ["Pinterest OAuth app + consent via /admin/social"], constraints: [],
    };
  } catch (error) {
    return { provider: "pinterest", configured: false, mode: "unconfigured", direct_configured: false, webhook_configured: false, credential_source: "none", credential_scopes: "", direct_capabilities: ["image_pin", "video_pin", "boards", "analytics"], live_publish_supported: false, missing_direct_env: [String(error?.message || error)], constraints: [] };
  }
}

export async function pinterestAccountCheck(env = process.env) {
  const resolved = await resolvePinterest(env);
  if (!resolved.token) return { ok: false, provider: "pinterest", state: "NOT_CONFIGURED", error: "Pinterest OAuth non connecté" };
  const response = await fetch(`${API}/user_account`, { headers: auth(resolved.token), cache: "no-store" });
  const data = await json(response, "Pinterest user_account");
  return { ok: true, provider: "pinterest", state: "READ_TESTED", credential_source: resolved.source, account: { username: data.username || "", account_type: data.account_type || "", profile_image: data.profile_image || "" } };
}

async function fetchMedia(url) {
  const parsed = new URL(clean(url));
  if (parsed.protocol !== "https:") throw new Error("Pinterest media_url doit utiliser HTTPS");
  const response = await fetch(parsed, { cache: "no-store" });
  if (!response.ok) throw new Error(`Pinterest media download ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error("Pinterest média vide ou trop volumineux");
  return { bytes, type: response.headers.get("content-type") || "video/mp4" };
}
async function waitMedia(mediaId, token) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${API}/media/${encodeURIComponent(mediaId)}`, { headers: auth(token), cache: "no-store" });
    const data = await json(response, "Pinterest media status");
    const status = clean(data.status).toLowerCase();
    if (["succeeded", "success"].includes(status)) return data;
    if (["failed", "error"].includes(status)) throw new Error(`Pinterest media processing ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Pinterest media processing timeout");
}
async function videoMediaId(mediaUrl, token) {
  const reg = await fetch(`${API}/media`, { method: "POST", headers: auth(token), body: JSON.stringify({ media_type: "video" }), cache: "no-store" });
  const registered = await json(reg, "Pinterest register media");
  if (!registered.media_id || !registered.upload_url) throw new Error("Pinterest register media incomplet");
  const media = await fetchMedia(mediaUrl);
  const form = new FormData();
  for (const [key, value] of Object.entries(registered.upload_parameters || {})) form.append(key, String(value));
  form.append("file", new Blob([media.bytes], { type: media.type }), "hibou-video.mp4");
  const upload = await fetch(registered.upload_url, { method: "POST", body: form });
  if (!upload.ok && upload.status !== 204) throw new Error(`Pinterest upload ${upload.status}`);
  await waitMedia(registered.media_id, token);
  return registered.media_id;
}

export async function dispatchPinterestPost(input, env = process.env) {
  const boardId = clean(input.board_id) || clean(env.PINTEREST_DEFAULT_BOARD_ID);
  const link = clean(input.metadata?.cta_url || input.link || "");
  const isVideo = Boolean(clean(input.cover_image_url)) || /\.(mp4|mov|m4v)(\?|$)/i.test(clean(input.media_url));
  const preview = { provider: "pinterest", board_id: boardId, title: clean(input.title).slice(0, 100), description: clean(input.caption).slice(0, 500), link, media_type: isVideo ? "video" : "image", media_url: clean(input.media_url), cover_image_url: clean(input.cover_image_url) };
  if (input.dry_run !== false) return { ok: true, dry_run: true, provider: "pinterest", payload: preview };
  const resolved = await resolvePinterest(env);
  if (!resolved.token) throw new Error("Pinterest OAuth non configuré");
  if (!boardId) throw new Error("Pinterest board_id requis pour publication live");
  let mediaSource;
  if (isVideo) {
    if (!clean(input.cover_image_url)) throw new Error("Pinterest cover_image_url requis pour un Pin vidéo");
    const mediaId = await videoMediaId(input.media_url, resolved.token);
    mediaSource = { source_type: "video_id", cover_image_url: clean(input.cover_image_url), media_id: mediaId };
  } else {
    mediaSource = { source_type: "image_url", url: clean(input.media_url), is_standard: true };
  }
  const response = await fetch(`${API}/pins`, {
    method: "POST", headers: auth(resolved.token), cache: "no-store",
    body: JSON.stringify({ board_id: boardId, title: preview.title, description: preview.description, ...(link ? { link } : {}), media_source: mediaSource }),
  });
  const data = await json(response, "Pinterest create pin");
  return { ok: true, dry_run: false, provider: "pinterest", pin_id: data.id || "", url: data.id ? `https://www.pinterest.com/pin/${data.id}/` : "", board_id: data.board_id || boardId, credential_source: resolved.source };
}

export async function pinterestPinSnapshot(pinId, env = process.env) {
  const resolved = await resolvePinterest(env);
  if (!resolved.token) throw new Error("Pinterest OAuth non configuré");
  const response = await fetch(`${API}/pins/${encodeURIComponent(pinId)}?pin_metrics=true`, { headers: auth(resolved.token), cache: "no-store" });
  const data = await json(response, "Pinterest get pin");
  return { id: data.id || pinId, url: data.id ? `https://www.pinterest.com/pin/${data.id}/` : "", pin_metrics: data.pin_metrics || {}, raw: data };
}
