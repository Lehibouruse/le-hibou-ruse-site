import { loadSocialCredential, socialCredentialStatuses } from "./social-credential-vault.mjs";
import { socialGatewayStatus } from "./social-gateway.mjs";

const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];

const ALLOWED_KEYS = {
  youtube: ["YOUTUBE_ACCESS_TOKEN", "YOUTUBE_REFRESH_TOKEN"],
  tiktok: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_REFRESH_TOKEN", "TIKTOK_OPEN_ID"],
  meta: ["META_ACCESS_TOKEN", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID"],
  linkedin: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN", "LINKEDIN_AUTHOR_URN"],
  threads: ["THREADS_ACCESS_TOKEN", "THREADS_REFRESH_TOKEN", "THREADS_USER_ID"],
  x: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID"],
};

function vaultProvider(network) {
  const value = String(network || "").trim().toLowerCase();
  if (["instagram", "facebook"].includes(value)) return "meta";
  if (["youtube", "tiktok", "linkedin", "threads", "x"].includes(value)) return value;
  return "";
}

function whitelisted(provider, payload = {}) {
  const output = {};
  const source = payload?.env && typeof payload.env === "object" ? payload.env : payload;
  for (const key of ALLOWED_KEYS[provider] || []) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim()) output[key] = source[key];
  }
  return output;
}

export async function resolveSocialEnv(network, baseEnv = process.env) {
  const provider = vaultProvider(network);
  if (!provider) return { env: baseEnv, source: "none", vault_provider: "", vault_error: "" };
  try {
    const credential = await loadSocialCredential(provider, "primary", baseEnv);
    if (!credential) return { env: baseEnv, source: "environment", vault_provider: provider, vault_error: "" };
    return {
      env: { ...baseEnv, ...whitelisted(provider, credential.payload) },
      source: "encrypted_vault",
      vault_provider: provider,
      vault_error: "",
      expires_at: credential.expiresAt,
      scopes: credential.scopes,
    };
  } catch (error) {
    return {
      env: baseEnv,
      source: "environment",
      vault_provider: provider,
      vault_error: String(error?.message || error).slice(0, 500),
    };
  }
}

export async function socialGatewayStatusWithVault(baseEnv = process.env) {
  const vaultStatuses = await socialCredentialStatuses().catch(() => []);
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
      vault_status: vaultStatuses.find((item) => item.provider === resolved.vault_provider)?.status || "",
    });
  }
  return output;
}

export { NETWORKS as SOCIAL_NETWORKS, vaultProvider as socialVaultProvider };
