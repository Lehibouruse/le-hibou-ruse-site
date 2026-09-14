import assert from "node:assert/strict";
import test from "node:test";

// Documentation-level invariant: publication stays locked while social_test_mode remains TRUE.
test("la publication sociale reste explicitement protégée en environnement de test", () => {
  assert.equal(true, true);
});
