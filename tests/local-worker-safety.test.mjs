import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("../scripts/hibou-local-worker.mjs",import.meta.url),"utf8");
const installer=readFileSync(new URL("../scripts/install-hibou-local-worker.ps1",import.meta.url),"utf8");
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
