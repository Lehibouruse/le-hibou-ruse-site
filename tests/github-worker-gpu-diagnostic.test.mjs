import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/hibou-github-worker.mjs", import.meta.url), "utf8");

test("le diagnostic worker reste local et inspecte GPU/Python sans réseau", () => {
  assert.match(source, /HIBOU_GITHUB_WORKER_DIAGNOSTIC_V2/);
  assert.match(source, /nvidia-smi/);
  assert.match(source, /memory_total_gib/);
  assert.match(source, /python_candidates/);
  assert.match(source, /network_tested: false/);
  assert.match(source, /queue_fetched: false/);
  assert.match(source, /downloads_performed: false/);
});
