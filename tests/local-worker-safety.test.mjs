import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("../scripts/hibou-local-worker.mjs",import.meta.url),"utf8");
const installer=readFileSync(new URL("../scripts/install-hibou-local-worker.ps1",import.meta.url),"utf8");
const bootstrap=readFileSync(new URL("../scripts/bootstrap-hibou-local-worker.ps1",import.meta.url),"utf8");
const githubWorker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const publicQueue=JSON.parse(readFileSync(new URL("../config/local-worker-queue.json",import.meta.url),"utf8"));
const docs=readFileSync(new URL("../docs/HIBOU_LOCAL_WORKER.md",import.meta.url),"utf8");

test("local worker refuses browser-cookie extraction from Airtable commands",()=>{
  assert.match(worker,/cookies_from_browser refusé en V1/);
  assert.doesNotMatch(worker,/args\.push\("--cookies-from-browser"/);
});
test("installer does not start or download by default",()=>{
  assert.match(installer,/\[switch\]\$StartWorker/);
  assert.match(installer,/--diagnostic/);
  assert.match(installer,/if \(\$StartWorker\)/);
  assert.doesNotMatch(installer,/\$Worker --once/);
});
test("diagnostic explicitly performs no network or download proof",()=>{
  assert.match(worker,/network_tested: false/);
  assert.match(worker,/downloads_performed: false/);
});
test("docs do not claim an unverified exact ROG model",()=>{
  assert.match(docs,/modèle exact.*doivent être relevés/i);
  assert.doesNotMatch(docs,/RTX 4070 Laptop, 8 Go VRAM/);
});

test("one-command bootstrap is side-effect free unless StartWorker is explicit",()=>{
  assert.match(bootstrap,/\[switch\]\$StartWorker/);
  assert.match(bootstrap,/--diagnostic/);
  assert.match(bootstrap,/if \(\$StartWorker\)/);
  assert.doesNotMatch(bootstrap,/\$Worker --once/);
});

test("tokenless worker is execution-gated even when the public queue contains active jobs",()=>{
  assert.match(githubWorker,/HIBOU_LOCAL_EXECUTION_ENABLED/);
  assert.match(githubWorker,/execution_enabled: EXECUTION_ENABLED/);
  assert.match(githubWorker,/if \(!EXECUTION_ENABLED\)/);
  assert.ok((publicQueue.jobs || []).some((job)=>job.active === true));
  assert.ok((publicQueue.jobs || []).every((job)=>typeof job.id === "string" && job.id.length > 0));
  assert.doesNotMatch(githubWorker,/approved_batch_id/);
});
test("tokenless bootstrap performs diagnostic only unless StartWorker is explicit",()=>{
  assert.match(bootstrap,/\[switch\]\$StartWorker/);
  assert.match(bootstrap,/HIBOU_LOCAL_EXECUTION_ENABLED", "false"/);
  assert.match(bootstrap,/--diagnostic/);
  assert.match(bootstrap,/if \(\$StartWorker\)/);
  assert.doesNotMatch(bootstrap,/\$Worker --once/);
});

test("tokenless worker requires exact local job approval in addition to global execution opt-in",()=>{
  assert.match(githubWorker,/HIBOU_LOCAL_APPROVED_JOB_ID/);
  assert.match(githubWorker,/approved-jobs\.json/);
  assert.match(githubWorker,/if \(!APPROVED_JOB_ID && approvedJobs\.size === 0\)/);
  assert.match(githubWorker,/x\.id === APPROVED_JOB_ID \|\| approvedJobs\.has\(x\.id\)/);
  assert.doesNotMatch(githubWorker,/APPROVED_JOB_ID === ["']ALL["']/);
  assert.doesNotMatch(githubWorker,/approved_batch_id/);
});

test("bootstrap writes local corpus approvals only behind an explicit switch",()=>{
  assert.match(bootstrap,/\[switch\]\$ApproveCorpus150/);
  assert.match(bootstrap,/if \(\$ApproveCorpus150\)/);
  assert.match(bootstrap,/approved-jobs\.json/);
  assert.match(bootstrap,/HIBOU_LOCAL_EXECUTION_ENABLED", "false"/);
});
