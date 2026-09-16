import assert from "node:assert/strict";
import test from "node:test";
import { githubInfrastructureStatus, systemHealthConfigValues, systemHealthHeartbeat } from "../lib/infrastructure-observability.mjs";

const NOW = Date.parse("2026-09-16T10:00:00.000Z");

function response(data, ok = true, status = 200) {
  return { ok, status, async json() { return data; } };
}

test("le heartbeat persistant reste compact et n'enregistre pas les erreurs brutes ni secrets", () => {
  const values = systemHealthConfigValues({
    severity: "degraded",
    ok: true,
    counts: { jobs: 8, jobs_error: 1 },
    issues: [{ severity: "warning", code: "job_error", count: 1, detail: "Bearer SUPER_SECRET_TOKEN" }],
    launch_ready: false,
    launch_blockers: [{ key: "domain_verified", detail: "secret detail" }],
  }, { active: true, until: "2026-09-16T11:00:00.000Z", reason: "credit_balance_exhausted sk-secret" }, "2026-09-16T10:00:00.000Z", [
    { action: "social_read_health_test", provider: "tiktok", ok: false, error: "token-secret", record_id: "recSecret" },
  ]);
  const report = JSON.parse(values.system_health_report);
  assert.equal(values.system_health_status, "degraded");
  assert.equal(report.issues[0].code, "job_error");
  assert.equal(report.issues[0].detail, undefined);
  assert.deepEqual(report.launch_blockers, ["domain_verified"]);
  assert.deepEqual(report.last_actions, [{ action: "social_read_health_test", provider: "tiktok", ok: false }]);
  assert.equal(report.openai.circuit_active, true);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /SUPER_SECRET_TOKEN|sk-secret|token-secret|recSecret/);
});

test("un heartbeat de moins de 30 minutes est frais", () => {
  const heartbeat = systemHealthHeartbeat({
    system_health_status: "ok",
    system_health_checked_at: "2026-09-16T09:45:00.000Z",
    system_health_report: JSON.stringify({ counts: { jobs: 3 } }),
  }, NOW);
  assert.equal(heartbeat.known, true);
  assert.equal(heartbeat.stale, false);
  assert.equal(heartbeat.status, "ok");
  assert.equal(heartbeat.report.counts.jobs, 3);
});

test("un heartbeat ancien ou absent devient STALE et ne conserve jamais un faux vert", () => {
  const stale = systemHealthHeartbeat({
    system_health_status: "ok",
    system_health_checked_at: "2026-09-16T09:00:00.000Z",
    system_health_report: "{}",
  }, NOW);
  assert.equal(stale.known, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.status, "stale");
  assert.equal(stale.last_status, "ok");
  const missing = systemHealthHeartbeat({}, NOW);
  assert.equal(missing.known, false);
  assert.equal(missing.stale, true);
  assert.equal(missing.status, "stale");
});

test("GitHub CI et Vercel ne sont verts que sur preuve alignée avec main", async () => {
  const sha = "a".repeat(40);
  const fetchImpl = async (url) => {
    if (url.endsWith("/commits/main")) return response({ sha });
    if (url.includes("/actions/workflows/ci.yml/runs")) return response({ workflow_runs: [{ id: 10, status: "completed", conclusion: "success", head_sha: sha, updated_at: "2026-09-16T09:59:00Z" }] });
    if (url.endsWith(`/commits/${sha}/status`)) return response({ statuses: [{ context: "Vercel", state: "success" }] });
    throw new Error(`unexpected ${url}`);
  };
  const status = await githubInfrastructureStatus({ fetchImpl, env: { VERCEL_GIT_COMMIT_SHA: sha } });
  assert.equal(status.known, true);
  assert.equal(status.ci.conclusion, "success");
  assert.equal(status.ci.aligned_with_main, true);
  assert.equal(status.vercel.status, "success");
  assert.equal(status.vercel.aligned_with_main, true);
});

test("un déploiement Vercel sur un autre commit n'est pas déclaré aligné", async () => {
  const sha = "a".repeat(40);
  const fetchImpl = async (url) => {
    if (url.endsWith("/commits/main")) return response({ sha });
    if (url.includes("/actions/workflows/ci.yml/runs")) return response({ workflow_runs: [{ status: "completed", conclusion: "success", head_sha: sha }] });
    return response({ statuses: [{ context: "Vercel", state: "success" }] });
  };
  const status = await githubInfrastructureStatus({ fetchImpl, env: { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) } });
  assert.equal(status.vercel.status, "success");
  assert.equal(status.vercel.aligned_with_main, false);
});

test("une panne GitHub devient UNKNOWN au lieu d'un faux échec ou succès", async () => {
  const status = await githubInfrastructureStatus({ fetchImpl: async () => { throw new Error("network down"); }, env: {} });
  assert.equal(status.known, false);
  assert.equal(status.ci.conclusion, "unknown");
  assert.equal(status.vercel.status, "unknown");
  assert.match(status.error, /network down/);
});
