import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const config=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
const all=(config.headers||[]).find(x=>x.source==="/(.*)");
const map=Object.fromEntries((all?.headers||[]).map(x=>[x.key,x.value]));

test("global low-risk security headers are configured",()=>{
  assert.equal(map["X-Content-Type-Options"],"nosniff");
  assert.equal(map["X-Frame-Options"],"DENY");
  assert.equal(map["Referrer-Policy"],"strict-origin-when-cross-origin");
  assert.match(map["Permissions-Policy"],/camera=\(\)/);
  assert.match(map["Permissions-Policy"],/microphone=\(\)/);
  assert.match(map["Strict-Transport-Security"],/^max-age=31536000$/);
});

test("HSTS does not opt into preload or unverified subdomain policy",()=>{
  assert.doesNotMatch(map["Strict-Transport-Security"],/preload/i);
  assert.doesNotMatch(map["Strict-Transport-Security"],/includeSubDomains/i);
});

test("global CSP is deliberately not introduced without browser validation",()=>{
  assert.equal(map["Content-Security-Policy"],undefined);
});
