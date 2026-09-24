import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
const globalHeaders=vercel.headers?.find((entry)=>entry.source==="/(.*)")?.headers||[];
const byKey=new Map(globalHeaders.map((item)=>[item.key,item.value]));

test("security headers keep CSP in report-only mode until violations are reviewed",()=>{
  assert.equal(byKey.has("Content-Security-Policy"),false);
  assert.equal(byKey.has("Content-Security-Policy-Report-Only"),true);
  const csp=byKey.get("Content-Security-Policy-Report-Only");
  assert.match(csp,/default-src 'self'/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/base-uri 'self'/);
  assert.match(csp,/form-action 'self' https:\/\/\*\.lemonsqueezy\.com/);
  assert.match(csp,/connect-src 'self'/);
});

test("existing baseline headers remain present",()=>{
  assert.equal(byKey.get("X-Content-Type-Options"),"nosniff");
  assert.equal(byKey.get("X-Frame-Options"),"DENY");
  assert.equal(byKey.get("Referrer-Policy"),"strict-origin-when-cross-origin");
  assert.match(byKey.get("Strict-Transport-Security")||"",/max-age=/);
});
