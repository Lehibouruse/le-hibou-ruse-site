import { createHmac } from "node:crypto";

export const DIGIFY_API_ORIGIN = "https://svc.digify.com";
export const DIGIFY_ADD_RECIPIENT_DEFAULT_URL = `${DIGIFY_API_ORIGIN}/v1/file/recipient/add`;
export const DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL = `${DIGIFY_API_ORIGIN}/v1/file/recipient/remove`;
export const DIGIFY_RECIPIENT_LIST_BASE_URL = `${DIGIFY_API_ORIGIN}/v1/file/recipient`;
export const DIGIFY_FILE_SEARCH_URL = `${DIGIFY_API_ORIGIN}/v1/file/search`;
const DIGIFY_WEBHOOK_KDF_CONTEXT = "hibou:digify:webhook-basic:v1";

function text(value) {
  return String(value ?? "").trim();
}

export function resolveDigifyWebhookAuth(env = process.env) {
  const explicitUser = text(env.DIGIFY_WEBHOOK_USERNAME);
  const explicitPassword = text(env.DIGIFY_WEBHOOK_PASSWORD);
  if (explicitUser || explicitPassword) {
    if (!explicitUser || !explicitPassword) {
      throw new Error("DIGIFY_WEBHOOK_USERNAME et DIGIFY_WEBHOOK_PASSWORD doivent être configurés ensemble");
    }
    return { username: explicitUser, password: explicitPassword, source: "explicit" };
  }

  const root = text(env.CRON_SECRET);
  if (!root) return { username: "", password: "", source: "missing" };
  const password = createHmac("sha256", root)
    .update(DIGIFY_WEBHOOK_KDF_CONTEXT)
    .digest("base64url")
    .slice(0, 40);
  return { username: "hibou-digify", password, source: "derived" };
}

export function digifyReadiness(env = process.env) {
  let webhookAuthReady = false;
  let webhookAuthSource = "missing";
  try {
    const auth = resolveDigifyWebhookAuth(env);
    webhookAuthReady = Boolean(auth.username && auth.password);
    webhookAuthSource = auth.source;
  } catch {
    webhookAuthSource = "invalid";
  }

  return {
    credentials_present: Boolean(text(env.DIGIFY_KEY_ID) && text(env.DIGIFY_SECRET)),
    add_recipient_endpoint: text(env.DIGIFY_ADD_RECIPIENT_URL) || DIGIFY_ADD_RECIPIENT_DEFAULT_URL,
    revoke_recipient_endpoint: text(env.DIGIFY_REVOKE_RECIPIENT_URL) || DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL,
    recipient_contract_builtin: true,
    revocation_contract_builtin: true,
    // Backward-compatible readiness flags. The official Postman contract is now
    // encoded in code, so no operator-provided body templates are required.
    add_template_present: true,
    revoke_endpoint_present: true,
    revoke_template_present: true,
    webhook_auth_ready: webhookAuthReady,
    webhook_auth_source: webhookAuthSource,
  };
}
