import { createHmac } from "node:crypto";

export const DIGIFY_ADD_RECIPIENT_DEFAULT_URL = "https://api.digify.com/v1/file/recipient/add";
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
    add_template_present: Boolean(text(env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE)),
    revoke_endpoint_present: Boolean(text(env.DIGIFY_REVOKE_RECIPIENT_URL)),
    revoke_template_present: Boolean(text(env.DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE)),
    webhook_auth_ready: webhookAuthReady,
    webhook_auth_source: webhookAuthSource,
  };
}
