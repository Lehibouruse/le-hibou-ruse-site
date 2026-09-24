import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../app/api/analyze-montage/route.js",import.meta.url),"utf8");

test("montage analysis requires admin or service auth before any paid-AI path",()=>{
  const auth=source.indexOf("adminOrServiceAuthorized(request)");
  const policy=source.indexOf("if (PAID_AI_DISABLED_BY_POLICY)");
  const openai=source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(auth>=0);
  assert.ok(policy>auth);
  assert.ok(openai>auth);
  assert.match(source,/if \(!adminOrServiceAuthorized\(request\)\) return serviceUnauthorized\(\)/);
});

test("montage analysis keeps paid AI fail-closed by project policy",()=>{
  assert.match(source,/paid_ai_disabled_by_policy/);
  assert.match(source,/openai_calls: 0/);
});
