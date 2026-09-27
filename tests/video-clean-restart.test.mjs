import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("launcher cleans only Hibou-specific orphan render processes", () => {
  assert.match(launcher, /hibou-github-worker\.mjs/);
  assert.match(launcher, /video-master\.runtime\.mjs/);
  assert.match(launcher, /\\LeHibou\\image-runtime\\/);
  assert.match(launcher, /chatterbox-storyboard-batch\.runtime\.py/);
  assert.match(launcher, /run-hibou-worker-watchdog\.ps1/);
});

test("launcher leaves ComfyUI out of clean restart process matching", () => {
  const cleanup = launcher.slice(
    launcher.indexOf("Get-CimInstance Win32_Process"),
    launcher.indexOf("Start-Sleep -Milliseconds 500"),
  );
  assert.doesNotMatch(cleanup, /ComfyUI/i);
});
