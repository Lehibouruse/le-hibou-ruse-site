import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

test("Vercel auto-deploys only main", () => {
  assert.equal(vercel.git.deploymentEnabled["**"], false);
  assert.equal(vercel.git.deploymentEnabled.main, true);
  assert.equal(vercel.git.deploymentEnabled["hibou-agent/**"], undefined);
});

test("lib backend changes are deployment-relevant", () => {
  assert.match(vercel.git.ignoreCommand, /-- app components lib public/);
});

test("existing production crons stay unchanged", () => {
  assert.deepEqual(vercel.crons, [
    { path: "/api/health", schedule: "37 5 * * *" },
    { path: "/api/domain-reconcile", schedule: "53 5 * * *" },
  ]);
});
