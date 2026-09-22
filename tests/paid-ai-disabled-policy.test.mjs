import test from "node:test";
import assert from "node:assert/strict";
import { getAgentConfig, PAID_AI_DISABLED_BY_POLICY } from "../lib/hibou-agent.mjs";

test("paid OpenAI agent is disabled by project policy even if old env vars try to enable it", () => {
  assert.equal(PAID_AI_DISABLED_BY_POLICY, true);
  const config = getAgentConfig({
    AI_ENABLED: "true",
    HIBOU_AI_KILL_SWITCH: "false",
    HIBOU_ALLOW_TERRA: "true",
    HIBOU_ALLOW_SOL: "true",
    HIBOU_ALLOW_ASTRA: "true",
  });
  assert.equal(config.aiEnabled, false);
  assert.equal(config.allowTerra, false);
  assert.equal(config.allowSol, false);
  assert.equal(config.allowAstra, false);
});
