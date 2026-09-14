import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const prepare = readFileSync(new URL("../scripts/prepare-hibou-worker.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");

test("le Core prépare les outils sociaux serveur sans exposer de secrets", () => {
  assert.match(prepare, /case \"social_status\"/);
  assert.match(prepare, /case \"social_prepare\"/);
  assert.match(prepare, /operation: \"tool\"/);
  assert.doesNotMatch(prepare, /ACCESS_TOKEN|CLIENT_SECRET|API_KEY/);
});

test("le workflow applique la préparation avant le worker", () => {
  assert.match(workflow, /Prepare worker server-tool relays/);
  assert.match(workflow, /node scripts\/prepare-hibou-worker\.mjs/);
  assert.match(workflow, /node scripts\/hibou-worker\.mjs/);
  assert.ok(workflow.indexOf("prepare-hibou-worker.mjs") < workflow.indexOf("node scripts/hibou-worker.mjs"));
});
