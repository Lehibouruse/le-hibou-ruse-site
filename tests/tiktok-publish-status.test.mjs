import assert from "node:assert/strict";
import test from "node:test";
import { fetchTikTokPublishStatus, normalizeTikTokPublishStatus, pollTikTokPublishStatus } from "../lib/tiktok-publish-status.mjs";

test("normalise PUBLISH_COMPLETE et récupère le vrai post_id TikTok", () => {
  const status = normalizeTikTokPublishStatus({
    data: {
      status: "PUBLISH_COMPLETE",
      publicaly_available_post_id: ["7654321"],
      uploaded_bytes: 123,
    },
  }, "pub-1");
  assert.equal(status.complete, true);
  assert.equal(status.final, true);
  assert.equal(status.post_id, "7654321");
  assert.equal(status.publish_id, "pub-1");
});

test("fetch status n'expose pas le token et envoie le publish_id attendu", async () => {
  let received = null;
  const fakeFetch = async (url, init) => {
    received = { url, init };
    return new Response(JSON.stringify({ data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const status = await fetchTikTokPublishStatus("pub-2", "secret-token", fakeFetch);
  assert.equal(status.status, "PROCESSING_UPLOAD");
  assert.equal(JSON.parse(received.init.body).publish_id, "pub-2");
  assert.equal(received.init.headers.Authorization, "Bearer secret-token");
  assert.equal(JSON.stringify(status).includes("secret-token"), false);
});

test("polling s'arrête dès PUBLISH_COMPLETE", async () => {
  const states = ["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "PUBLISH_COMPLETE"];
  let calls = 0;
  const fakeFetch = async () => {
    const status = states[Math.min(calls, states.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ data: { status, publicaly_available_post_id: status === "PUBLISH_COMPLETE" ? ["post-9"] : [] }, error: { code: "ok" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await pollTikTokPublishStatus("pub-3", "token", { fetchImpl: fakeFetch, sleep: async () => {}, attempts: 8, intervalMs: 250 });
  assert.equal(calls, 3);
  assert.equal(result.final, true);
  assert.equal(result.post_id, "post-9");
});

test("FAILED est final et conserve fail_reason", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ data: { status: "FAILED", fail_reason: "file_format_check_failed" }, error: { code: "ok" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await pollTikTokPublishStatus("pub-4", "token", { fetchImpl: fakeFetch, sleep: async () => {} });
  assert.equal(result.failed, true);
  assert.equal(result.final, true);
  assert.equal(result.fail_reason, "file_format_check_failed");
});
