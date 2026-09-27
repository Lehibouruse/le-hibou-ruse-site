import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("watchdog is emitted without PowerShell here-strings", () => {
  assert.match(launcher, /\$WatchdogContent = @\(/);
  assert.match(launcher, /\) -join \[Environment\]::NewLine/);
  assert.doesNotMatch(launcher, /\$WatchdogContent = @'/);
  assert.doesNotMatch(launcher, /\$WatchdogContent = @"/);
  assert.doesNotMatch(launcher, /\$CmdContent = @"/);
});

test("watchdog template contains no escaped-dollar parser hazards", () => {
  assert.equal(launcher.includes(String.fromCharCode(96) + "$child"), false);
  assert.equal(launcher.includes(String.fromCharCode(96) + "$health"), false);
  assert.match(launcher, /while \(-not \$child\.HasExited\)/);
  assert.match(launcher, /\$health\.last_video_heartbeat_at/);
});

test("watchdog runtime paths are inserted through placeholders", () => {
  assert.match(launcher, /__HIBOU_NODE__/);
  assert.match(launcher, /__HIBOU_WORKER__/);
  assert.match(launcher, /__HIBOU_INSTALL_DIR__/);
  assert.match(launcher, /Replace\("__HIBOU_NODE__", \$Node\)/);
  assert.match(launcher, /Replace\("__HIBOU_WORKER__", \$Worker\)/);
  assert.match(launcher, /Replace\("__HIBOU_INSTALL_DIR__", \$InstallDir\)/);
});
