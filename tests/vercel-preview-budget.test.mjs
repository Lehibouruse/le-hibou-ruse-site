import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../scripts/hibou-worker.mjs", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("Vercel reste désactivé par défaut mais autorise main et les candidats auto-merge", () => {
  assert.equal(vercel.git.deploymentEnabled["**"], false);
  assert.equal(vercel.git.deploymentEnabled["hibou-agent/**"], true);
  assert.equal(vercel.git.deploymentEnabled.main, true);
});

test("le worker réserve hibou-agent aux jobs explicitement autorisés à fusionner", () => {
  assert.match(worker, /merge_authorization === true/);
  assert.match(worker, /mergeAuthorized \? "hibou-agent" : "hibou-review"/);
  assert.match(worker, /const branch = branchName\(job\)/);
});

test("une PR sans autorisation de fusion économise la preview avant tout polling Vercel", () => {
  const authorizationGate = worker.indexOf("if (!mergeAuthorized)");
  const vercelPolling = worker.indexOf('let vercel = "pending"');
  assert(authorizationGate >= 0);
  assert(vercelPolling >= 0);
  assert(authorizationGate < vercelPolling);
  assert.match(worker, /vercel: "skipped"/);
  assert.match(worker, /preview Vercel économisée/);
});

test("une fusion automatique conserve la preview Vercel comme garde-fou", () => {
  assert.match(worker, /if \(vercel !== "success"\)/);
  assert.match(worker, /Fusion refusée: preview Vercel non validée/);
  assert.match(worker, /pulls\/\$\{data\.number\}\/merge/);
});
