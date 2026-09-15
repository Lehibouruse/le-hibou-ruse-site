import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const prepare = readFileSync(new URL("../scripts/prepare-hibou-worker.mjs", import.meta.url), "utf8");
const capabilities = readFileSync(new URL("../lib/agent-capabilities.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");

test("le Core route status, prepare et publish_* vers /api/social sans secret", () => {
  assert.match(prepare, /const SOCIAL_API/);
  assert.match(prepare, /case \"social_status\"/);
  assert.match(prepare, /case \"social_prepare\"/);
  for (const provider of ["youtube", "instagram", "facebook", "threads", "tiktok", "linkedin", "pinterest", "x"]) {
    assert.match(capabilities, new RegExp(`publish_\\$\\{provider\\}|publish_${provider}`));
  }
  assert.match(prepare, /publication_authorization/);
  assert.match(prepare, /human_approved/);
  assert.match(prepare, /idempotency_key/);
  assert.doesNotMatch(prepare, /ACCESS_TOKEN|CLIENT_SECRET|API_KEY/);
});

test("le workflow applique la préparation avant le worker", () => {
  assert.match(workflow, /Prepare worker server-tool relays/);
  assert.match(workflow, /node scripts\/prepare-hibou-worker\.mjs/);
  assert.match(workflow, /node scripts\/hibou-worker\.mjs/);
  assert.ok(workflow.indexOf("prepare-hibou-worker.mjs") < workflow.indexOf("node scripts/hibou-worker.mjs"));
});
