import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../scripts/start-hibou-video-stack.ps1", import.meta.url),
  "utf8",
);

test("launcher self-updates from the exact deployed runtime commit", () => {
  assert.match(launcher, /\$LauncherUrl = "\$RawBase\/scripts\/start-hibou-video-stack\.ps1"/);
  assert.match(launcher, /start-hibou-video-stack\.candidate\.ps1/);
  assert.match(launcher, /Get-FileHash -LiteralPath \$PSCommandPath -Algorithm SHA256/);
  assert.match(launcher, /Get-FileHash -LiteralPath \$LauncherCandidate -Algorithm SHA256/);
});

test("launcher self-update is guarded against recursion", () => {
  assert.match(launcher, /HIBOU_LAUNCHER_SELF_UPDATE_ACTIVE/);
  assert.match(launcher, /\$SelfUpdateActive -ne "1"/);
  assert.match(launcher, /SetEnvironmentVariable\("HIBOU_LAUNCHER_SELF_UPDATE_ACTIVE", "1", "Process"\)/);
  assert.match(launcher, /-File \$LauncherCandidate/);
});

test("launcher validates downloaded launcher before executing it", () => {
  assert.match(launcher, /launcherCandidateSource -notmatch 'HIBOU_VIDEO_STACK_READY'/);
  assert.match(launcher, /launcherCandidateSource -notmatch 'HIBOU_LAUNCHER_SELF_UPDATE'/);
  assert.doesNotMatch(launcher, /le-hibou-ruse-site\/main\/scripts\/start-hibou-video-stack\.ps1/);
});

test("ready payload declares persistent launcher self-update", () => {
  assert.match(launcher, /launcher = \$RuntimeLauncher/);
  assert.match(launcher, /launcher_self_update = \$true/);
});


test("launcher persistently forces worker self-update enabled", () => {
  assert.match(launcher, /Set-UserEnv "HIBOU_WORKER_SELF_UPDATE_ENABLED" "true"/);
});
