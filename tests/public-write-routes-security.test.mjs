import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const leads=readFileSync(new URL("../app/api/leads/route.js",import.meta.url),"utf8");
const conversion=readFileSync(new URL("../app/api/conversion-event/route.js",import.meta.url),"utf8");
const withdrawal=readFileSync(new URL("../app/api/retractation/route.js",import.meta.url),"utf8");

test("public Airtable write routes enforce bounded JSON payloads",()=>{
  for(const source of [leads,conversion,withdrawal]){
    assert.match(source,/MAX_BODY_BYTES = 10_000/);
    assert.match(source,/content-type/i);
    assert.match(source,/Buffer\.byteLength/);
  }
});

test("lead submission requires a trusted site origin and keeps the honeypot",()=>{
  assert.match(leads,/ALLOWED_ORIGINS/);
  assert.match(leads,/allowedOrigin\(request\)/);
  assert.match(leads,/Origin refused/);
  assert.match(leads,/if \(body\.company\) return json\(\{ ok: true \}\)/);
});

test("conversion and withdrawal routes require trusted origins",()=>{
  for(const source of [conversion,withdrawal]){
    assert.match(source,/ALLOWED_ORIGINS/);
    assert.match(source,/allowedOrigin\(request\)/);
    assert.match(source,/Origin refused/);
  }
});

test("conversion events deduplicate every event_id before Airtable write",()=>{
  assert.match(conversion,/if \(await exists\(eventId\)\)/);
  assert.doesNotMatch(conversion,/event === "landing" && await exists/);
});
