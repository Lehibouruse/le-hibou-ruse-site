import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const plan=readFileSync(new URL("../docs/PUBLIC_ENDPOINT_ABUSE_PROTECTION.md",import.meta.url),"utf8");

test("anti-abuse plan is log-first and does not claim deployment",()=>{
  assert.match(plan,/Phase 1 — observer/);
  assert.match(plan,/règle custom Vercel \*\*Log\*\*/);
  assert.match(plan,/plan\. La protection n’est considérée active/);
});

test("provider webhook is excluded from browser challenge grouping",()=>{
  assert.match(plan,/lemon-webhook/);
  assert.match(plan,/Ne pas lui appliquer un challenge navigateur/);
});

test("plan rejects in-memory serverless limiter as primary control",()=>{
  assert.match(plan,/pas de rate limiter en mémoire dans une Function/);
});

test("public write endpoints are explicitly inventoried",()=>{
  for(const path of [
    "/api/leads",
    "/api/conversion-event",
    "/api/retractation",
    "/api/commerce/digital-supply-consent"
  ]) assert.match(plan,new RegExp(path.replaceAll("/","\\/")));
});
