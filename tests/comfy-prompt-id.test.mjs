import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../scripts/video-local-adapters.mjs", import.meta.url),
  "utf8",
);

test("ComfyUI image adapter lets the server generate prompt_id", () => {
  assert.match(source, /body: JSON\.stringify\(\{ prompt: workflow, client_id: "hibou-local-worker" \}\)/);
  assert.doesNotMatch(source, /prompt_id:\s*promptId/);
});

test("ComfyUI image adapter uses the returned prompt_id for history polling", () => {
  assert.match(source, /const promptId = String\(submitted\?\.prompt_id \|\| ""\)\.trim\(\)/);
  assert.match(source, /ComfyUI \/prompt returned no prompt_id/);
  assert.match(source, /\/history\/\$\{encodeURIComponent\(promptId\)\}/);
});
