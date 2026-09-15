import test from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_FANOUT_PROVIDERS, fanoutChildSpec, requestedFanoutProviders } from "../lib/social-fanout.mjs";

test("provider all développe les neuf réseaux dans un ordre stable", () => {
  assert.deepEqual(requestedFanoutProviders({ provider: "all" }), [...SOCIAL_FANOUT_PROVIDERS]);
  assert.equal(SOCIAL_FANOUT_PROVIDERS.length, 9);
});

test("une liste explicite déduplique et ignore les providers inconnus", () => {
  assert.deepEqual(
    requestedFanoutProviders({ providers: ["YouTube", "instagram", "youtube", "unknown", "pinterest"] }),
    ["youtube", "instagram", "pinterest"],
  );
});

test("un job enfant fan-out est Pending, déterministe et ne contient plus providers", () => {
  const now = new Date("2026-09-15T14:00:00.000Z");
  const input = {
    parentJobId: "social-parent-001",
    parentIdempotencyKey: "social-parent-001",
    provider: "youtube",
    params: {
      providers: ["youtube", "instagram"],
      media_url: "https://example.com/video.mp4",
      caption: "Le Hibou",
      publication_authorization: false,
    },
    requestedBy: "ChatGPT",
    priority: "High",
    requiresReview: true,
    maxRetries: 2,
    now,
  };
  const first = fanoutChildSpec(input);
  const second = fanoutChildSpec(input);
  assert.deepEqual(first, second);
  assert.equal(first.job_id, "social-parent-001:youtube");
  assert.equal(first.idempotency_key, "social-parent-001:youtube");
  assert.equal(first.status, "Pending");
  assert.equal(first.action, "SCHEDULE_POST");
  assert.equal(first.target, "youtube");
  assert.equal(first.requires_review, true);
  const params = JSON.parse(first.parameters);
  assert.equal(params.provider, "youtube");
  assert.equal(params.idempotency_key, "social-parent-001:youtube");
  assert.equal(params.fanout_parent_job_id, "social-parent-001");
  assert.equal("providers" in params, false);
});

test("un parent network all ne se réinjecte pas dans les enfants", () => {
  const child = fanoutChildSpec({
    parentJobId: "parent-002",
    provider: "tiktok",
    params: { network: "all", media_url: "https://example.com/video.mp4" },
  });
  const params = JSON.parse(child.parameters);
  assert.equal(params.provider, "tiktok");
  assert.equal("network" in params, false);
});
