import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("worker health state exposes render heartbeat freshness", () => {
  assert.equal(worker.includes("last_video_heartbeat_at"), true);
  assert.equal(worker.includes("render_started_at"), true);
  assert.equal(worker.includes("state.last_video_heartbeat_at = heartbeatAt"), true);
});

test("watchdog probes local health and restarts only after sustained failure", () => {
  assert.equal(
    launcher.includes('Invoke-RestMethod -Uri "http://127.0.0.1:8765/health"'),
    true,
  );
  assert.equal(launcher.includes("last_video_heartbeat_at"), true);
  assert.equal(launcher.includes("ageSeconds -gt 120"), true);
  assert.equal(launcher.includes("unhealthy -ge 3"), true);
});

test("watchdog cleans Hibou render children but not ComfyUI", () => {
  const start = launcher.indexOf("function Stop-HibouRenderChildren");
  const end = launcher.indexOf("while (\`$true)", start);
  const block = launcher.slice(start, end);
  assert.match(block, /video-master\.runtime\.mjs/);
  assert.match(block, /\\LeHibou\\image-runtime\\/);
  assert.match(block, /chatterbox-storyboard-batch\.runtime\.py/);
  assert.doesNotMatch(block, /ComfyUI/i);
});
