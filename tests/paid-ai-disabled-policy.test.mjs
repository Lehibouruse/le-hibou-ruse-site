import test from "node:test";
import assert from "node:assert/strict";
import { getAgentConfig, PAID_AI_DISABLED_BY_POLICY } from "../lib/hibou-agent.mjs";

test("paid OpenAI execution stays disabled even if stale env vars try to enable it", () => {
  assert.equal(PAID_AI_DISABLED_BY_POLICY, true);
  const config = getAgentConfig({
    AI_ENABLED: "true",
    HIBOU_AI_KILL_SWITCH: "false",
    HIBOU_ALLOW_TERRA: "true",
    HIBOU_ALLOW_SOL: "true",
    HIBOU_ALLOW_ASTRA: "true",
  });
  assert.equal(config.aiEnabled, false);
  // Routing metadata can remain available for historical jobs/tests; execution is the killed surface.
  assert.equal(config.allowTerra, true);
  assert.equal(config.allowSol, true);
  assert.equal(config.allowAstra, true);
});
