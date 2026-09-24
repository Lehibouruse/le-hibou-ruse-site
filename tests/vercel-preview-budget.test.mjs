import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../scripts/hibou-worker.mjs", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("Vercel reste désactivé par défaut et ne déploie automatiquement que main", () => {
  assert.equal(vercel.git.deploymentEnabled["**"], false);
  assert.equal(vercel.git.deploymentEnabled["hibou-agent/**"], undefined);
  assert.equal(vercel.git.deploymentEnabled.main, true);
});

test("les changements backend lib déclenchent bien un déploiement main", () => {
  assert.match(vercel.git.ignoreCommand, /-- app components lib public/);
});

test("le worker conserve son garde-fou historique de branche même si les previews agent sont désactivées", () => {
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

test("le code historique de fusion refuse toujours une preview non validée s'il était réactivé", () => {
  assert.match(worker, /if \(vercel !== "success"\)/);
  assert.match(worker, /Fusion refusée: preview Vercel non validée/);
  assert.match(worker, /pulls\/\$\{data\.number\}\/merge/);
});
