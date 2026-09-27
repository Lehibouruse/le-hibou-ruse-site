import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("launcher requires a full deployed runtime commit from authenticated queue", () => {
  assert.match(launcher, /\$queue\.runtime_commit/);
  assert.match(launcher, /\$RuntimeCommit\.Length -ne 40/);\n  assert.match(launcher, /\^\[0-9a-fA-F\]\+\$/);
  assert.match(launcher, /Queue VIDEO_RENDER sans runtime_commit valide/);
});

test("launcher downloads worker and video runtimes from immutable deployed commit", () => {
  assert.match(launcher, /raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/\$RuntimeCommit/);
  assert.match(launcher, /\$RawBase\/scripts\/hibou-github-worker\.mjs/);
  assert.match(launcher, /\$RawBase\/scripts\/video-master\.mjs/);
  assert.match(launcher, /\$RawBase\/scripts\/chatterbox-storyboard-batch\.py/);
  assert.doesNotMatch(launcher, /le-hibou-ruse-site\/main\/scripts\/(?:hibou-github-worker|video-master|chatterbox-storyboard-batch)/);
});

test("Windows startup re-runs the persistent launcher so it resolves the current deployed commit", () => {
  assert.match(launcher, /start-hibou-video-stack\.runtime\.ps1/);
  assert.match(launcher, /Copy-Item -LiteralPath \$CurrentLauncher -Destination \$RuntimeLauncher -Force/);
  assert.match(launcher, /-File "\$RuntimeLauncher"/);
  assert.doesNotMatch(launcher, /start-hibou-worker\.ps1/);
});

test("ready output exposes runtime commit", () => {
  assert.match(launcher, /runtime_commit = \$RuntimeCommit/);
});
