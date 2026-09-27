import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("launcher installs a persistent worker watchdog", () => {
  assert.match(launcher, /run-hibou-worker-watchdog\.ps1/);
  assert.match(launcher, /while \(\$true\)/);
  assert.match(launcher, /WaitForExit\(\)/);
  assert.match(launcher, /Start-Sleep -Seconds 5/);
});

test("launcher stops only Hibou worker and watchdog processes before restart", () => {
  assert.match(launcher, /hibou-github-worker\.mjs/);
  assert.match(launcher, /run-hibou-worker-watchdog\.ps1/);
  assert.match(launcher, /\$_\.ProcessId -ne \$PID/);
});

test("ready payload exposes watchdog path", () => {
  assert.match(launcher, /watchdog = \$WatchdogScript/);
});
