import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("watchdog is emitted from a literal PowerShell here-string", () => {
  assert.match(launcher, /\$WatchdogContent = @'/);
  assert.match(launcher, /\n'@\n\$WatchdogContent = \$WatchdogContent\.Replace/);
  assert.doesNotMatch(launcher, /\$WatchdogContent = @"/);
});

test("watchdog template contains no escaped-dollar parser hazards", () => {
  const start = launcher.indexOf("$WatchdogContent = @'");
  const end = launcher.indexOf("\n'@", start);
  assert.ok(start >= 0 && end > start);
  const block = launcher.slice(start, end);
  assert.equal(block.includes(String.fromCharCode(96) + "$"), false);
  assert.match(block, /while \(-not \$child\.HasExited\)/);
  assert.match(block, /\$health\.last_video_heartbeat_at/);
});

test("watchdog runtime paths are inserted through placeholders", () => {
  assert.match(launcher, /__HIBOU_NODE__/);
  assert.match(launcher, /__HIBOU_WORKER__/);
  assert.match(launcher, /__HIBOU_INSTALL_DIR__/);
  assert.match(launcher, /Replace\("__HIBOU_NODE__", \$Node\)/);
  assert.match(launcher, /Replace\("__HIBOU_WORKER__", \$Worker\)/);
  assert.match(launcher, /Replace\("__HIBOU_INSTALL_DIR__", \$InstallDir\)/);
});
