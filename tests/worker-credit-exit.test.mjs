import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/hibou-worker.mjs", import.meta.url), "utf8");

test("une pause crédit finalisée ne fait pas échouer GitHub Actions", () => {
  assert.match(source, /const finalized = await api\(\{ operation: "finalize"/);
  assert.match(source, /finalized\.paused_credit !== true/);
  assert.doesNotMatch(source, /if \(outcome\.status === "failed"\) process\.exitCode = 1/);
});

test("un véritable échec worker garde un exit code non nul", () => {
  assert.match(source, /if \(outcome\.status === "failed" && finalized\.paused_credit !== true\) process\.exitCode = 1/);
});
