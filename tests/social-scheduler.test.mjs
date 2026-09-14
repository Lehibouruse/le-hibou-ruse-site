import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("wake route SCHEDULE_POST vers le scheduler social avant l'orchestrateur historique", () => {
  const wake = readFileSync(new URL("../app/api/wake/route.js", import.meta.url), "utf8");
  assert.match(wake, /action === "SCHEDULE_POST"/);
  assert.match(wake, /SOCIAL_SCHEDULER_PATH = "\/api\/social-scheduler"/);
  assert.ok(wake.indexOf('action === "SCHEDULE_POST"') < wake.indexOf("!isAgenticAction"));
});

test("le scheduler social respecte dry-run, revue humaine, retries et idempotence", () => {
  const scheduler = readFileSync(new URL("../app/api/social-scheduler/route.js", import.meta.url), "utf8");
  assert.match(scheduler, /publication_authorization/);
  assert.match(scheduler, /human_approved/);
  assert.match(scheduler, /idempotency_key/);
  assert.match(scheduler, /Manual Review/);
  assert.match(scheduler, /status: "Retry"/);
  assert.match(scheduler, /\/api\/social/);
});

test("les changements du scheduler social déclenchent un self-test du Core", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  assert.match(workflow, /app\/api\/social-scheduler\/\*\*/);
});
