import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PAID_AI_DISABLED_BY_POLICY } from "../lib/hibou-agent.mjs";

test("paid OpenAI policy is hard-disabled and every known external paid-AI entry point gates it", async () => {
  assert.equal(PAID_AI_DISABLED_BY_POLICY, true);
  const files = [
    "app/api/orchestrator/route.js",
    "app/api/agent-worker/route.js",
    "app/api/wake/route.js",
    "app/api/analyze-montage/route.js",
    "app/api/book-scheduler/route.js",
    "app/api/book-finalizer/route.js",
  ];
  for (const path of files) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /PAID_AI_DISABLED_BY_POLICY/);
    assert.match(source, /paid_ai_disabled_by_policy|désactivée par politique projet/);
  }
});
