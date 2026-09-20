import { loadSocialCredential, socialCredentialStatuses, storeSocialCredential } from "./social-credential-vault.mjs";
import { socialGatewayStatus } from "./social-gateway.mjs";

const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "snapchat"];
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

const ALLOWED_KEYS = {
  youtube: ["YOUTUBE_ACCESS_TOKEN", "YOUTUBE_REFRESH_TOKEN"],
  tiktok: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_REFRESH_TOKEN", "TIKTOK_OPEN_ID"],
  meta: ["META_ACCESS_TOKEN", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID"],
  instagram: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_USERNAME"],
  linkedin: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN", "LINKEDIN_AUTHOR_URN"],
  threads: ["THREADS_ACCESS_TOKEN", "THREADS_REFRESH_TOKEN", "THREADS_USER_ID"],
  pinterest: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_REFRESH_TOKEN", "PINTEREST_USER_ID", "PINTEREST_USERNAME"],
  x: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID"],
};

function clean(value) { return String(value ?? "").trim(); }
function vaultProvider(network) {
  const value = clean(network).toLowerCase();
  if (value === "facebook") return "meta";
  if (["youtube", "instagram", "tiktok", "linkedin", "threads", "pinterest", "x"].includes(value)) return value;
  return "";
}

function whitelisted(provider, payload = {}) {
  const output = {};
  const source = payload?.env && typeof payload.env === "object" ? payload.env : payload;
  for (const key of ALLOWED_KEYS[provider] || []) {
    if (source[key] !== undefined && source[key] !== null && clean(source[key])) output[key] = source[key];
  }
  return output;
}

function expiresSoon(credential) {
  if (!credential?.expiresAt) return false;
  const expires = Date.parse(credential.expiresAt);
  return Number.isFinite(expires) && expires - Date.now() <= REFRESH_WINDOW_MS;
}

export function refreshFailureRequiresReauth(error) {
  const status = Number(error?.status || 0);
  if ([400, 401, 403].includes(status)) return true;
  const message = clean(error?.message || error).toLowerCase();
  return /(invalid_grant|invalid refresh|refresh token.*(expired|invalid|revoked)|token.*revoked)/i.test(message);
}

async function tokenForm(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(Object.entries(fields).filter(([, value]) => clean(value)).map(([key, value]) => [key, String(value)])),
    cache: "no-store",
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 1000) }; }
  if (!response.ok) {
    const error = new Error(`OAuth refresh ${response.status}: ${data.error_description || data.error || data.text || response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function persistRefreshed(provider, credential, nextEnv, token, baseEnv) {
  const payload = { ...credential.payload, env: { ...(credential.payload?.env || {}), ...nextEnv } };
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : credential.expiresAt;
  await storeSocialCredential({
    provider,
    accountKey: credential.accountKey,
    payload,
    scopes: token.scope || credential.scopes,
    expiresAt,
    status: "Connected",
  }, baseEnv);
  return { ...credential, payload, expiresAt, scopes: token.scope || credential.scopes };
}

async function persistNeedsReauth(provider, credential, reason, baseEnv) {
  await storeSocialCredential({
    provider,
    accountKey: credential.accountKey,
    payload: credential.payload,
    scopes: credential.scopes,
    expiresAt: credential.expiresAt,
    status: "Needs reauth",
    error: clean(reason).slice(0, 1000),
  }, baseEnv).catch(() => {});
}

async function markNeedsReauth(provider, credential, reason, baseEnv) {
  await persistNeedsReauth(provider, credential, reason, baseEnv);
  throw new Error(reason);
}

async function refreshCredential(provider, credential, baseEnv) {
  if (!expiresSoon(credential)) return credential;
  const current = credential.payload?.env || {};

  if (provider === "youtube") {
    if (!clean(current.YOUTUBE_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "YouTube refresh token absent", baseEnv);
    const token = await tokenForm("https://oauth2.googleapis.com/token", {
      client_id: baseEnv.YOUTUBE_CLIENT_ID,
      client_secret: baseEnv.YOUTUBE_CLIENT_SECRET,
      refresh_token: current.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });
    return persistRefreshed(provider, credential, { YOUTUBE_ACCESS_TOKEN: token.access_token }, token, baseEnv);
  }

  if (provider === "tiktok") {
    if (!clean(current.TIKTOK_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "TikTok refresh token absent", baseEnv);
    const token = await tokenForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: baseEnv.TIKTOK_CLIENT_KEY,
      client_secret: baseEnv.TIKTOK_CLIENT_SECRET,
      refresh_token: current.TIKTOK_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });
    return persistRefreshed(provider, credential, {
      TIKTOK_ACCESS_TOKEN: token.access_token,
      TIKTOK_REFRESH_TOKEN: token.refresh_token || current.TIKTOK_REFRESH_TOKEN,
      TIKTOK_OPEN_ID: token.open_id || current.TIKTOK_OPEN_ID || "",
    }, token, baseEnv);
  }

  if (provider === "linkedin") {
    if (!clean(current.LINKEDIN_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "LinkedIn refresh token absent ou non accordé", baseEnv);
    const token = await tokenForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "refresh_token",
      refresh_token: current.LINKEDIN_REFRESH_TOKEN,
      client_id: baseEnv.LINKEDIN_CLIENT_ID,
      client_secret: baseEnv.LINKEDIN_CLIENT_SECRET,
    });
    return persistRefreshed(provider, credential, {
      LINKEDIN_ACCESS_TOKEN: token.access_token,
      LINKEDIN_REFRESH_TOKEN: token.refresh_token || current.LINKEDIN_REFRESH_TOKEN,
    }, token, baseEnv);
  }

  if (provider === "pinterest") {
    if (!clean(current.PINTEREST_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "Pinterest refresh token absent", baseEnv);
    const clientId = clean(baseEnv.PINTEREST_APP_ID);
    const clientSecret = clean(baseEnv.PINTEREST_APP_SECRET);
    if (!clientId || !clientSecret) return markNeedsReauth(provider, credential, "Pinterest client credentials absents", baseEnv);
    const headers = { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` };
    const token = await tokenForm("https://api.pinterest.com/v5/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: current.PINTEREST_REFRESH_TOKEN,
    }, headers);
    return persistRefreshed(provider, credential, {
      PINTEREST_ACCESS_TOKEN: token.access_token,
      PINTEREST_REFRESH_TOKEN: token.refresh_token || current.PINTEREST_REFRESH_TOKEN,
      PINTEREST_USER_ID: current.PINTEREST_USER_ID || "",
      PINTEREST_USERNAME: current.PINTEREST_USERNAME || "",
    }, token, baseEnv);
  }

  if (provider === "x") {
    if (!clean(current.X_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "X refresh token absent; offline.access requis", baseEnv);
    const headers = {};
    if (clean(baseEnv.X_CLIENT_SECRET)) headers.Authorization = `Basic ${Buffer.from(`${baseEnv.X_CLIENT_ID}:${baseEnv.X_CLIENT_SECRET}`).toString("base64")}`;
    const token = await tokenForm(clean(baseEnv.X_TOKEN_URL) || "https://api.x.com/2/oauth2/token", {
      grant_type: "refresh_token",
      refresh_token: current.X_REFRESH_TOKEN,
      client_id: baseEnv.X_CLIENT_ID,
    }, headers);
    return persistRefreshed(provider, credential, {
      X_ACCESS_TOKEN: token.access_token,
      X_REFRESH_TOKEN: token.refresh_token || current.X_REFRESH_TOKEN,
    }, token, baseEnv);
  }

  if (provider === "threads") {
    if (!clean(current.THREADS_ACCESS_TOKEN)) return markNeedsReauth(provider, credential, "Threads access token absent", baseEnv);
    const url = new URL(clean(baseEnv.THREADS_REFRESH_URL) || "https://graph.threads.net/refresh_access_token");
    url.searchParams.set("grant_type", "th_refresh_token");
    url.searchParams.set("access_token", current.THREADS_ACCESS_TOKEN);
    const response = await fetch(url, { cache: "no-store" });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) {
      const error = new Error(`Threads refresh ${response.status}: ${token.error?.message || token.error || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return persistRefreshed(provider, credential, { THREADS_ACCESS_TOKEN: token.access_token }, token, baseEnv);
  }

  if (provider === "instagram") {
    if (!clean(current.INSTAGRAM_ACCESS_TOKEN)) return markNeedsReauth(provider, credential, "Instagram access token absent", baseEnv);
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", current.INSTAGRAM_ACCESS_TOKEN);
    const response = await fetch(url, { cache: "no-store" });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) {
      const error = new Error(`Instagram refresh ${response.status}: ${token.error?.message || token.error || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return persistRefreshed(provider, credential, {
      INSTAGRAM_ACCESS_TOKEN: token.access_token,
      INSTAGRAM_BUSINESS_ACCOUNT_ID: current.INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
      INSTAGRAM_USERNAME: current.INSTAGRAM_USERNAME || "",
    }, token, baseEnv);
  }

  if (provider === "meta") return markNeedsReauth(provider, credential, "Jeton Meta arrivé à expiration; reconnexion requise", baseEnv);
  return credential;
}

export async function resolveSocialEnv(network, baseEnv = process.env) {
  const provider = vaultProvider(network);
  if (!provider) return { env: baseEnv, source: "none", vault_provider: "", vault_error: "" };
  let credential = null;
  try {
    credential = await loadSocialCredential(provider, "primary", baseEnv);
    if (!credential) return { env: baseEnv, source: "environment", vault_provider: provider, vault_error: "" };
    credential = await refreshCredential(provider, credential, baseEnv);
    return {
      env: { ...baseEnv, ...whitelisted(provider, credential.payload) },
      source: "encrypted_vault",
      vault_provider: provider,
      vault_error: "",
      expires_at: credential.expiresAt,
      scopes: credential.scopes,
    };
  } catch (error) {
    if (credential && expiresSoon(credential) && refreshFailureRequiresReauth(error)) {
      await persistNeedsReauth(provider, credential, String(error?.message || error), baseEnv);
    }
    return {
      env: baseEnv,
      source: "environment",
      vault_provider: provider,
      vault_error: String(error?.message || error).slice(0, 500),
    };
  }
}

export async function socialGatewayStatusWithVault(baseEnv = process.env) {
  const output = [];
  for (const network of NETWORKS) {
    const resolved = await resolveSocialEnv(network, baseEnv);
    const gateway = socialGatewayStatus(resolved.env).find((item) => item.provider === network);
    output.push({
      ...gateway,
      credential_source: resolved.source,
      vault_provider: resolved.vault_provider,
      vault_error: resolved.vault_error || "",
      credential_expires_at: resolved.expires_at || null,
      credential_scopes: resolved.scopes || "",
    });
  }
  // Read statuses after all refresh attempts so a refresh rejection is visible immediately.
  const vaultStatuses = await socialCredentialStatuses().catch(() => []);
  return output.map((item) => {
    const status = vaultStatuses.find((entry) => entry.provider === item.vault_provider);
    return {
      ...item,
      credential_expires_at: item.credential_expires_at || status?.expires_at || null,
      credential_scopes: item.credential_scopes || status?.scopes || "",
      vault_status: status?.status || "",
      vault_last_error: status?.last_error || "",
    };
  });
}

export { NETWORKS as SOCIAL_NETWORKS, vaultProvider as socialVaultProvider };
