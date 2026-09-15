import assert from "node:assert/strict";
import test from "node:test";
import { HIBOU_SESSION_KEY, sessionId } from "../lib/conversion-client.mjs";

function withStorage(run) {
  const data = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
  try { return run(data); }
  finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test("sessionId reste stable pour une session locale", () => {
  withStorage((data) => {
    const first = sessionId();
    const second = sessionId();
    assert.ok(first.length >= 8);
    assert.equal(second, first);
    assert.equal(data.get(HIBOU_SESSION_KEY), first);
  });
});
