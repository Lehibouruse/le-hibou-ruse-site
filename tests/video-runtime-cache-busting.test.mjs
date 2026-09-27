import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("launcher cache-busts canonical runtime downloads", () => {
  assert.match(launcher, /hibou_cb=/);
  assert.match(launcher, /Cache-Control/);
  assert.match(launcher, /Pragma/);
});

test("launcher verifies canonical runtime markers after download", () => {
  assert.match(launcher, /inspect\\\.signature\\\(ChatterboxMultilingualTTS\\\.from_pretrained\\\)/);
  assert.match(launcher, /pathToFileURL\\\(resolve\\\(process\\\.argv\\\[1\\\]\\\)\\\)\\\.href/);
  assert.match(launcher, /Runtime Chatterbox stale ou invalide/);
  assert.match(launcher, /Runtime video-master stale ou invalide/);
});
