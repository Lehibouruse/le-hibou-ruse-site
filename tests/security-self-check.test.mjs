import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("security self-check stays local and heuristic",()=>{
  const source=readFileSync(new URL("../scripts/security-self-check.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/fetch\s*\(/);
  assert.doesNotMatch(source,/https?:\/\//);
  assert.match(source,/HIBOU_SECURITY_SELF_CHECK_V1/);
  assert.match(source,/Private key material detected/);
  assert.match(source,/Possible public listener/);
});
