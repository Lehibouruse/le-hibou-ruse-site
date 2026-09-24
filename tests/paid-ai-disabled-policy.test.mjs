import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PAID_AI_DISABLED_BY_POLICY } from "../lib/hibou-agent.mjs";

test("paid OpenAI policy is hard-disabled", () => {
  assert.equal(PAID_AI_DISABLED_BY_POLICY, true);
});

test("every known paid-AI entry point gates OpenAI", async () => {
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
    assert.match(source, /PAID_AI_DISABLED_BY_POLICY/, path);
    assert.match(source, /paid_ai_disabled_by_policy|désactivée par politique projet/, path);
  }
});

test("worker cannot bypass policy through an already-claimed response job", async () => {
  const source = await readFile(new URL("../app/api/agent-worker/route.js", import.meta.url), "utf8");
  assert.match(source, /async function openaiStep\(body\) \{\n  if \(PAID_AI_DISABLED_BY_POLICY\)/);
  assert.match(source, /async function openaiStepStatus\(body\) \{\n  if \(PAID_AI_DISABLED_BY_POLICY\)/);
  assert.match(source, /async function claim\(body = \{\}\) \{\n  if \(PAID_AI_DISABLED_BY_POLICY\)/);
});

test("wake can still select deterministic work while refusing paid-AI-only queues", async () => {
  const source = await readFile(new URL("../app/api/wake/route.js", import.meta.url), "utf8");
  assert.match(source, /records\.find\(\(job\) => !requiresOpenAi\(job\)\)/);
  assert.match(source, /reason: !candidate && PAID_AI_DISABLED_BY_POLICY/);
});

test("example configuration is fail-closed with zero paid-AI budgets", async () => {
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const expected = [
    "AI_ENABLED=false",
    "HIBOU_AI_KILL_SWITCH=true",
    "HIBOU_ALLOW_TERRA=false",
    "HIBOU_ALLOW_SOL=false",
    "HIBOU_ALLOW_ASTRA=false",
    "HIBOU_MAX_AI_CALLS_PER_JOB=0",
    "HIBOU_MAX_COST_PER_JOB_USD=0",
    "HIBOU_DAILY_SOFT_BUDGET_USD=0",
    "HIBOU_DAILY_HARD_BUDGET_USD=0",
  ];
  for (const value of expected) assert.ok(env.includes(value), value);
});
