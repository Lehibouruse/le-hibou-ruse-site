import test from "node:test";
import assert from "node:assert/strict";
import { isProjectAiEnabled } from "../lib/ai-policy.mjs";

test("project AI is disabled when variables are missing", () => {
  assert.equal(isProjectAiEnabled({}), false);
});
test("AI_ENABLED alone cannot bypass the default kill switch", () => {
  assert.equal(isProjectAiEnabled({ AI_ENABLED: "true" }), false);
});
test("project AI requires two explicit choices", () => {
  assert.equal(isProjectAiEnabled({ AI_ENABLED: "true", HIBOU_AI_KILL_SWITCH: "false" }), true);
});
test("AI_ENABLED=false always wins", () => {
  assert.equal(isProjectAiEnabled({ AI_ENABLED: "false", HIBOU_AI_KILL_SWITCH: "false" }), false);
});
