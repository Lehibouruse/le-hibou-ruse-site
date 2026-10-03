import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolveReaderSecret } from './secure-reader.mjs';

export const PROBE_BUYER = 'lehibouruse@gmail.com';
export const PROBE_STORE = '475333';
export const PROBE_PRODUCT = '1369573';
export const PROBE_VARIANT = '2140119';
export const PROBE_WORKFLOW = 'commerce-release-probe.yml';
export const PROBE_JOURNAL = 'HIBOU_COMMERCE_RELEASE_PROBE_V1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIFETIME = 60 * 60 * 1000;
function mac(payload, env) {
  const key = resolveReaderSecret(env);
  if (!key) throw new Error('Probe signing unavailable');
  return createHmac('sha256', key).update(`hibou:zero-charge-release-probe:v1:${payload}`).digest('base64url');
}
export function issueCommerceProbe(env = process.env, now = Date.now()) {
  const identity = { v: 1, nonce: randomUUID(), issued: now, expires: now + LIFETIME };
  const data = Buffer.from(JSON.stringify(identity)).toString('base64url');
  return { ...identity, token: `${data}.${mac(data, env)}` };
}
export function decodeCommerceProbe(token, env = process.env, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
    const [data, provided] = token.split('.');
    const expected = mac(data, env);
    const a = Buffer.from(provided), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const identity = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (identity.v !== 1 || !UUID.test(identity.nonce) || !Number.isSafeInteger(identity.issued) || !Number.isSafeInteger(identity.expires)) return null;
    if (identity.issued > now + 1000 || identity.expires <= now || identity.expires - identity.issued !== LIFETIME) return null;
    return identity;
  } catch { return null; }
}
// This is NOT a consumer access bypass. The normal Lemon HMAC must already
// have been verified by the webhook. Only a genuine paid LIVE zero-euro order
// for the one owner address and exact Hibou product may use a short-lived ticket.
export function verifiedCommerceProbe(order, attributes, env = process.env, now = Date.now()) {
  const identity = decodeCommerceProbe(order?.customData?.hibou_release_probe, env, now);
  if (!identity || order?.event !== 'order_created' || order?.status !== 'paid' || order?.refunded || order?.testMode) return null;
  if (order.email !== PROBE_BUYER || order.currency !== 'EUR' || order.total !== 0) return null;
  if (order.productId !== PROBE_PRODUCT || order.variantId !== PROBE_VARIANT) return null;
  if (attributes?.total !== 0 || attributes?.test_mode !== false || String(attributes?.store_id) !== PROBE_STORE) return null;
  return identity;
}
