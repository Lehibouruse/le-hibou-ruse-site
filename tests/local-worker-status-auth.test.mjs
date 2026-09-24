import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route=readFileSync(new URL("../app/api/local-worker-status/route.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const bootstrap=readFileSync(new URL("../scripts/bootstrap-hibou-local-worker.ps1",import.meta.url),"utf8");

test("local worker status endpoint is fail-closed without a server token",()=>{
  assert.match(route,/HIBOU_LOCAL_REPORT_TOKEN/);
  assert.match(route,/timingSafeEqual/);
  assert.match(route,/reporting_disabled/);
  assert.match(route,/status:503/);
  assert.match(route,/authorization/);
});

test("status endpoint bounds and validates JSON before Airtable writes",()=>{
  assert.match(route,/MAX_BODY_BYTES = 20_000/);
  assert.match(route,/application\/json/);
  assert.match(route,/Buffer\.byteLength/);
  const authIndex=route.indexOf("reportAuthorized(request)");
  const writeIndex=route.indexOf("queryRecords(TABLES.localWorkerStatus");
  assert.ok(authIndex>=0 && writeIndex>authIndex);
});

test("tokenless worker skips remote reporting unless report token is explicitly present",()=>{
  assert.match(worker,/HIBOU_LOCAL_REPORT_TOKEN/);
  assert.match(worker,/if \(!REPORT_TOKEN\)/);
  assert.match(worker,/report_token_missing/);
  assert.match(worker,/Authorization: `Bearer \$\{REPORT_TOKEN\}`/);
});

test("bootstrap never provisions a reporting token implicitly",()=>{
  assert.doesNotMatch(bootstrap,/SetEnvironmentVariable\("HIBOU_LOCAL_REPORT_TOKEN"/);
  assert.doesNotMatch(bootstrap,/HIBOU_LOCAL_REPORT_TOKEN", "/);
});
