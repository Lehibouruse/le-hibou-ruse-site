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

test("CSP is deployed in report-only mode before enforcement",()=>{
  assert.equal(map["Content-Security-Policy"],undefined);
  const csp=map["Content-Security-Policy-Report-Only"];
  assert.ok(csp);
  assert.match(csp,/default-src 'self'/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/lemonsqueezy\.com/);
  assert.match(csp,/vercel-insights\.com/);
});

test("report-only CSP does not pretend unsafe-inline/eval are final policy",()=>{
  const csp=map["Content-Security-Policy-Report-Only"]||"";
  assert.match(csp,/unsafe-inline/);
  assert.match(csp,/unsafe-eval/);
});
