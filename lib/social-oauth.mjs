import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { storeSocialCredential } from "./social-credential-vault.mjs";

const SUPPORTED = ["youtube", "tiktok", "meta", "linkedin", "pinterest", "x", "threads"];

function clean(value) { return String(value ?? "").trim(); }
function nowIsoPlus(seconds) { return seconds ? new Date(Date.now() + Number(seconds) * 1000).toISOString() : null; }
function base64url(buffer) { return Buffer.from(buffer).toString("base64url"); }

function vaultKey(env = process.env) {
  const raw = clean(env.HIBOU_SOCIAL_VAULT_KEY);
  if (raw) {
    let key;
    if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
    else key = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (key.length !== 32) throw new Error("HIBOU_SOCIAL_VAULT_KEY invalide");
    return key;
  }
  const root = clean(env.CRON_SECRET);
  if (!root) throw new Error("HIBOU_SOCIAL_VAULT_KEY ou CRON_SECRET absent");
  return createHash("sha256").update("hibou-social-oauth-vault-v1\0").update(root).digest();
}

function sealState(payload, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(env), iv);
  cipher.setAAD(Buffer.from("hibou-social-oauth-state-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return `${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(ciphertext)}`;
}

function openState(value, env = process.env) {
  const [ivRaw, tagRaw, ciphertextRaw] = clean(value).split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("OAuth state invalide");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(env), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from("hibou-social-oauth-state-v1"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const payload = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final(),
  ]).toString("utf8"));
  if (!payload.ts || Date.now() - Number(payload.ts) > 15 * 60 * 1000) throw new Error("OAuth state expiré");
  return payload;
}

function providerName(value) {
  const provider = clean(value).toLowerCase();
  if (!SUPPORTED.includes(provider)) throw new Error(`OAuth provider non pris en charge: ${provider || "vide"}`);
  return provider;
}

function publicBase(env = process.env) {
  const candidate = clean(env.HIBOU_PUBLIC_BASE_URL) || (clean(env.VERCEL_PROJECT_PRODUCTION_URL) ? `https://${clean(env.VERCEL_PROJECT_PRODUCTION_URL)}` : "") || "https://le-hibou-ruse-site.vercel.app";
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("HIBOU_PUBLIC_BASE_URL doit être HTTPS");
  return url.origin;
}

function redirectUri(provider, env = process.env) {
  return `${publicBase(env)}/api/social/oauth/${provider}/callback`;
}

function required(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} absent`);
  return result;
}

function pkce() {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function config(providerInput, env = process.env) {
  const provider = providerName(providerInput);
  if (provider === "youtube") return {
    provider,
    clientId: required(env.YOUTUBE_CLIENT_ID, "YOUTUBE_CLIENT_ID"),
    clientSecret: required(env.YOUTUBE_CLIENT_SECRET, "YOUTUBE_CLIENT_SECRET"),
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: clean(env.YOUTUBE_OAUTH_SCOPES) || "https://www.googleapis.com/auth/youtube",
  };
  if (provider === "tiktok") return {
    provider,
    clientId: required(env.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY"),
    clientSecret: required(env.TIKTOK_CLIENT_SECRET, "TIKTOK_CLIENT_SECRET"),
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: clean(env.TIKTOK_OAUTH_SCOPES) || "user.info.basic,video.list,video.publish,video.upload",
  };
  if (provider === "linkedin") return {
    provider,
    clientId: required(env.LINKEDIN_CLIENT_ID, "LINKEDIN_CLIENT_ID"),
    clientSecret: required(env.LINKEDIN_CLIENT_SECRET, "LINKEDIN_CLIENT_SECRET"),
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    // r_member_postAnalytics is deliberately not forced here because LinkedIn
    // grants it through Community Management API access. Once approved, set
    // LINKEDIN_OAUTH_SCOPES to include it and reconnect from /admin/social.
    scopes: clean(env.LINKEDIN_OAUTH_SCOPES) || "openid profile w_member_social",
  };
  if (provider === "pinterest") return {
    provider,
    clientId: required(env.PINTEREST_APP_ID, "PINTEREST_APP_ID"),
    clientSecret: required(env.PINTEREST_APP_SECRET, "PINTEREST_APP_SECRET"),
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: clean(env.PINTEREST_OAUTH_SCOPES) || "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
  };
  if (provider === "x") return {
    provider,
    clientId: required(env.X_CLIENT_ID, "X_CLIENT_ID"),
    clientSecret: clean(env.X_CLIENT_SECRET),
    authorizeUrl: clean(env.X_AUTHORIZE_URL) || "https://x.com/i/oauth2/authorize",
    tokenUrl: clean(env.X_TOKEN_URL) || "https://api.x.com/2/oauth2/token",
    scopes: clean(env.X_OAUTH_SCOPES) || "tweet.read tweet.write users.read offline.access media.write",
    pkce: true,
  };
  if (provider === "meta") {
    const version = required(env.META_GRAPH_VERSION, "META_GRAPH_VERSION");
    return {
      provider,
      clientId: required(env.META_APP_ID, "META_APP_ID"),
      clientSecret: required(env.META_APP_SECRET, "META_APP_SECRET"),
      authorizeUrl: `https://www.facebook.com/${version}/dialog/oauth`,
      tokenUrl: `https://graph.facebook.com/${version}/oauth/access_token`,
      graphBase: `https://graph.facebook.com/${version}`,
      scopes: clean(env.META_OAUTH_SCOPES) || "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
    };
  }
  if (provider === "threads") return {
    provider,
    clientId: required(env.THREADS_APP_ID, "THREADS_APP_ID"),
    clientSecret: required(env.THREADS_APP_SECRET, "THREADS_APP_SECRET"),
    authorizeUrl: clean(env.THREADS_AUTHORIZE_URL) || "https://threads.net/oauth/authorize",
    tokenUrl: clean(env.THREADS_TOKEN_URL) || "https://graph.threads.net/oauth/access_token",
    scopes: clean(env.THREADS_OAUTH_SCOPES) || "threads_basic,threads_content_publish,threads_manage_insights",
  };
  throw new Error(`Provider non configuré: ${provider}`);
}

export function oauthProviderReadiness(env = process.env) {
  return SUPPORTED.map((provider) => {
    try {
      const cfg = config(provider, env);
      return { provider, ready: true, redirect_uri: redirectUri(provider, env), scopes: cfg.scopes, error: "" };
    } catch (error) {
      return { provider, ready: false, redirect_uri: redirectUri(provider, env), scopes: "", error: String(error?.message || error) };
    }
  });
}

export function buildSocialAuthorization(providerInput, env = process.env) {
  const cfg = config(providerInput, env);
  const code = cfg.pkce ? pkce() : null;
  const state = sealState({ provider: cfg.provider, ts: Date.now(), nonce: base64url(randomBytes(18)), verifier: code?.verifier || "" }, env);
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri(cfg.provider, env),
    state,
  });
  if (cfg.provider === "tiktok") {
    params.set("client_key", cfg.clientId);
    params.set("scope", cfg.scopes);
  } else {
    params.set("client_id", cfg.clientId);
    params.set("scope", cfg.scopes);
  }
  if (cfg.provider === "youtube") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  if (cfg.pkce) {
    params.set("code_challenge", code.challenge);
    params.set("code_challenge_method", "S256");
  }
  return { provider: cfg.provider, url: `${cfg.authorizeUrl}?${params}`, redirect_uri: redirectUri(cfg.provider, env), scopes: cfg.scopes };
}

async function formPost(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)])),
    cache: "no-store",
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 2000) }; }
  if (!response.ok) throw new Error(`OAuth token ${response.status}: ${data.error_description || data.error?.message || data.error || data.text || response.statusText}`);
  return data;
}

async function jsonGet(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OAuth profile ${response.status}: ${data.error?.message || data.message || response.statusText}`);
  return data;
}

async function exchangeYoutube(cfg, code, state, env) {
  const token = await formPost(cfg.tokenUrl, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: redirectUri(cfg.provider, env), grant_type: "authorization_code",
  });
  const channel = await jsonGet("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", token.access_token).catch(() => ({}));
  return {
    payload: { env: { YOUTUBE_ACCESS_TOKEN: token.access_token, YOUTUBE_REFRESH_TOKEN: token.refresh_token || "" }, profile: channel?.items?.[0] || {} },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangeTikTok(cfg, code, state, env) {
  const token = await formPost(cfg.tokenUrl, {
    client_key: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri(cfg.provider, env),
  });
  return {
    payload: { env: { TIKTOK_ACCESS_TOKEN: token.access_token, TIKTOK_REFRESH_TOKEN: token.refresh_token || "", TIKTOK_OPEN_ID: token.open_id || "" }, open_id: token.open_id || "" },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangeLinkedIn(cfg, code, state, env) {
  const token = await formPost(cfg.tokenUrl, {
    grant_type: "authorization_code", code, redirect_uri: redirectUri(cfg.provider, env), client_id: cfg.clientId, client_secret: cfg.clientSecret,
  });
  const profile = await jsonGet("https://api.linkedin.com/v2/userinfo", token.access_token).catch(() => ({}));
  const authorUrn = profile.sub ? `urn:li:person:${profile.sub}` : "";
  return {
    payload: { env: { LINKEDIN_ACCESS_TOKEN: token.access_token, LINKEDIN_REFRESH_TOKEN: token.refresh_token || "", LINKEDIN_AUTHOR_URN: authorUrn }, profile },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangePinterest(cfg, code, state, env) {
  const headers = { Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}` };
  const token = await formPost(cfg.tokenUrl, {
    grant_type: "authorization_code", code, redirect_uri: redirectUri(cfg.provider, env),
  }, headers);
  const profile = await jsonGet("https://api.pinterest.com/v5/user_account", token.access_token).catch(() => ({}));
  return {
    payload: { env: {
      PINTEREST_ACCESS_TOKEN: token.access_token,
      PINTEREST_REFRESH_TOKEN: token.refresh_token || "",
      PINTEREST_USER_ID: profile.id || "",
      PINTEREST_USERNAME: profile.username || "",
    }, profile },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangeX(cfg, code, state, env) {
  const headers = {};
  if (cfg.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  const token = await formPost(cfg.tokenUrl, {
    code, grant_type: "authorization_code", redirect_uri: redirectUri(cfg.provider, env), code_verifier: state.verifier, client_id: cfg.clientId,
  }, headers);
  const profile = await jsonGet("https://api.x.com/2/users/me", token.access_token).catch(() => ({}));
  return {
    payload: { env: { X_ACCESS_TOKEN: token.access_token, X_REFRESH_TOKEN: token.refresh_token || "", X_USER_ID: profile?.data?.id || "" }, profile: profile?.data || {} },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangeMeta(cfg, code, state, env) {
  const short = await formPost(cfg.tokenUrl, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(cfg.provider, env), code,
  });
  const longUrl = new URL(`${cfg.graphBase}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", cfg.clientId);
  longUrl.searchParams.set("client_secret", cfg.clientSecret);
  longUrl.searchParams.set("fb_exchange_token", short.access_token);
  const longResponse = await fetch(longUrl, { cache: "no-store" });
  const long = await longResponse.json().catch(() => ({}));
  const userToken = longResponse.ok && long.access_token ? long.access_token : short.access_token;
  const pages = await jsonGet(`${cfg.graphBase}/me/accounts?fields=id,name,access_token,instagram_business_account`, userToken).catch(() => ({ data: [] }));
  const all = Array.isArray(pages.data) ? pages.data : [];
  const preferredId = clean(env.META_TARGET_PAGE_ID);
  const page = all.find((item) => preferredId && String(item.id) === preferredId) || all.find((item) => item.instagram_business_account?.id) || all[0] || {};
  return {
    payload: {
      env: {
        META_ACCESS_TOKEN: userToken,
        FACEBOOK_PAGE_ACCESS_TOKEN: page.access_token || "",
        FACEBOOK_PAGE_ID: page.id || "",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: page.instagram_business_account?.id || "",
      },
      pages: all.map((item) => ({ id: item.id, name: item.name, instagram_business_account: item.instagram_business_account || null })),
    },
    scopes: cfg.scopes,
    expiresAt: nowIsoPlus(long.expires_in || short.expires_in),
  };
}

async function exchangeThreads(cfg, code, state, env) {
  const short = await formPost(cfg.tokenUrl, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri(cfg.provider, env), code,
  });
  let token = short;
  if (short.access_token) {
    const exchange = new URL("https://graph.threads.net/access_token");
    exchange.searchParams.set("grant_type", "th_exchange_token");
    exchange.searchParams.set("client_secret", cfg.clientSecret);
    exchange.searchParams.set("access_token", short.access_token);
    const response = await fetch(exchange, { cache: "no-store" });
    const long = await response.json().catch(() => ({}));
    if (response.ok && long.access_token) token = { ...short, ...long };
  }
  return {
    payload: { env: { THREADS_ACCESS_TOKEN: token.access_token, THREADS_REFRESH_TOKEN: token.refresh_token || "", THREADS_USER_ID: token.user_id || short.user_id || "" } },
    scopes: cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

export async function completeSocialAuthorization(providerInput, { code, state: sealedState }, env = process.env) {
  const provider = providerName(providerInput);
  const state = openState(sealedState, env);
  if (state.provider !== provider) throw new Error("OAuth state/provider incohérent");
  const cfg = config(provider, env);
  let result;
  if (provider === "youtube") result = await exchangeYoutube(cfg, code, state, env);
  else if (provider === "tiktok") result = await exchangeTikTok(cfg, code, state, env);
  else if (provider === "linkedin") result = await exchangeLinkedIn(cfg, code, state, env);
  else if (provider === "pinterest") result = await exchangePinterest(cfg, code, state, env);
  else if (provider === "x") result = await exchangeX(cfg, code, state, env);
  else if (provider === "meta") result = await exchangeMeta(cfg, code, state, env);
  else if (provider === "threads") result = await exchangeThreads(cfg, code, state, env);
  else throw new Error(`OAuth exchange non implémenté: ${provider}`);

  await storeSocialCredential({
    provider,
    accountKey: "primary",
    payload: result.payload,
    scopes: result.scopes,
    expiresAt: result.expiresAt,
  }, env);
  return { provider, scopes: result.scopes, expires_at: result.expiresAt, redirect_uri: redirectUri(provider, env) };
}

export const SOCIAL_OAUTH_PROVIDERS = [...SUPPORTED];
