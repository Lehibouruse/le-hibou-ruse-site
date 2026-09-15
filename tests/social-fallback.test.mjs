import test from "node:test";
import assert from "node:assert/strict";
import { dispatchSocialWebhookFallback, safeDirectFallbackError, socialWebhookFallbackConfigured } from "../lib/social-fallback.mjs";

test("fallback n'est autorisé que pour erreurs directes d'authentification clairement rejetées", () => {
  assert.equal(safeDirectFallbackError(new Error("Social API 401: invalid access token")), true);
  assert.equal(safeDirectFallbackError(new Error("Social API 403: permission denied")), true);
  assert.equal(safeDirectFallbackError(new Error("OAuth credential expired")), true);
  assert.equal(safeDirectFallbackError(new Error("Social API 500: upstream timeout")), false);
  assert.equal(safeDirectFallbackError(new Error("fetch failed")), false);
  assert.equal(safeDirectFallbackError(new Error("Meta container toujours en traitement")), false);
});

test("fallback exige un webhook HTTPS", () => {
  assert.equal(socialWebhookFallbackConfigured("youtube", { HIBOU_SOCIAL_YOUTUBE_WEBHOOK_URL: "https://example.com/hook" }), true);
  assert.equal(socialWebhookFallbackConfigured("youtube", { HIBOU_SOCIAL_YOUTUBE_WEBHOOK_URL: "http://example.com/hook" }), false);
  assert.equal(socialWebhookFallbackConfigured("youtube", {}), false);
});

test("fallback relaie le payload sans exposer le secret dans le résultat", async () => {
  let received;
  const fetchImpl = async (url, options) => {
    received = { url: String(url), options };
    return new Response(JSON.stringify({ external_id: "abc123" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await dispatchSocialWebhookFallback("youtube", {
    media_url: "https://example.com/video.mp4",
    caption: "Hibou",
    idempotency_key: "social-test-001",
  }, {
    HIBOU_SOCIAL_YOUTUBE_WEBHOOK_URL: "https://example.com/hook",
    HIBOU_SOCIAL_WEBHOOK_SECRET: "top-secret",
  }, fetchImpl);

  assert.equal(result.mode, "webhook_fallback");
  assert.equal(received.url, "https://example.com/hook");
  assert.equal(received.options.headers.Authorization, "Bearer top-secret");
  const sent = JSON.parse(received.options.body);
  assert.equal(sent.fallback_from, "direct");
  assert.equal(sent.idempotency_key, "social-test-001");
  assert.equal(JSON.stringify(result).includes("top-secret"), false);
});
