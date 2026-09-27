import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("queue embeds deployed runtime commit into storyboard", () => {
  assert.match(route, /job\.storyboard\.runtime_commit = RUNTIME_COMMIT/);
});

test("video master requires immutable runtime commit for image bundle", () => {
  assert.match(master, /storyboard runtime_commit missing or invalid/);
  assert.match(master, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(master, /image-runtime/);
});

test("video master downloads image runtime files from exact commit", () => {
  assert.match(master, /raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/\$\{normalized\}\/scripts\/\$\{name\}/);
  assert.match(master, /video-image-factory\.mjs/);
  assert.match(master, /video-image-batch\.mjs/);
  assert.match(master, /video-local-adapters\.mjs/);
});

test("image runtime refuses stale adapter without ComfyUI prompt-id fix", () => {
  assert.match(master, /ComfyUI \/prompt returned no prompt_id/);
  assert.match(master, /image runtime marker missing/);
});

test("image stage executes isolated runtime factory", () => {
  assert.match(master, /const imageFactoryScript=await ensureImageRuntimeBundle\(runtimeCommit\)/);
  assert.match(master, /run\(process\.execPath,\[\s*imageFactoryScript,/);
});
