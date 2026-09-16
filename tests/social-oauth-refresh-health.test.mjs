import test from "node:test";
import assert from "node:assert/strict";
import { refreshFailureRequiresReauth } from "../lib/social-credentials-runtime.mjs";

test("un rejet définitif de refresh demande une reconnexion humaine", () => {
  for (const status of [400, 401, 403]) {
    const error = new Error(`OAuth refresh ${status}: invalid_grant`);
    error.status = status;
    assert.equal(refreshFailureRequiresReauth(error), true);
  }
  assert.equal(refreshFailureRequiresReauth(new Error("invalid_grant: refresh token revoked")), true);
});

test("une panne transitoire ne détruit pas le credential OAuth", () => {
  for (const status of [429, 500, 502, 503]) {
    const error = new Error(`OAuth refresh ${status}: upstream unavailable`);
    error.status = status;
    assert.equal(refreshFailureRequiresReauth(error), false);
  }
  assert.equal(refreshFailureRequiresReauth(new Error("fetch failed")), false);
});
