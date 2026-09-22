import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_RESERVED_JOB_IDS, eligibleJobsFormula, reservedJobIds } from "../lib/job-eligibility.mjs";
import { validateGithubActionsClaims } from "../lib/github-oidc.mjs";
import { isAgenticAction, toolsForAction } from "../lib/agent-capabilities.mjs";
import { failureDisposition, vercelCommitState } from "../lib/agent-runtime.mjs";

const NOW = 2_000_000_000;
const CHECKOUT_SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
const SETUP_NODE_SHA = "a0853c24544627f65ddf259abe73b1d18a591444";
const UPLOAD_ARTIFACT_SHA = "ea165f8d65b6e75b540449e92b4886f43607fa02";

function validClaims(overrides = {}) {
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: "hibou-orchestrator",
    exp: NOW + 300,
    iat: NOW - 10,
    nbf: NOW - 10,
    repository: "Lehibouruse/le-hibou-ruse-site",
    ref: "refs/heads/main",
    sub: "repo:Lehibouruse/le-hibou-ruse-site:ref:refs/heads/main",
    workflow_ref: "Lehibouruse/le-hibou-ruse-site/.github/workflows/hibou-wake.yml@refs/heads/main",
    event_name: "workflow_dispatch",
    ...overrides,
  };
}

test("le scheduler exclut toujours les deux Jobs métier réservés", () => {
  const formula = eligibleJobsFormula({});
  for (const jobId of DEFAULT_RESERVED_JOB_IDS) assert.match(formula, new RegExp(jobId));
  assert.match(formula, /NOT\(OR\(/);
});

test("les exclusions configurées complètent les exclusions obligatoires", () => {
  const ids = reservedJobIds({ HIBOU_RESERVED_JOB_IDS: "job-a, job-b,job-a" });
  assert.deepEqual(ids, [...DEFAULT_RESERVED_JOB_IDS, "job-a", "job-b"]);
});

test("l'OIDC accepte uniquement le workflow scheduler exact sur main", () => {
  assert.equal(validateGithubActionsClaims(validClaims(), NOW).event_name, "workflow_dispatch");
  assert.equal(validateGithubActionsClaims(validClaims({ event_name: "schedule" }), NOW).event_name, "schedule");
  assert.equal(validateGithubActionsClaims(validClaims({ event_name: "push" }), NOW).event_name, "push");
  assert.equal(validateGithubActionsClaims(validClaims({ sub: "repository_id:1367354762:environment:Production" }), NOW).ref, "refs/heads/main");
  assert.throws(() => validateGithubActionsClaims(validClaims({ event_name: "pull_request" }), NOW), /event/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ workflow_ref: "Lehibouruse/le-hibou-ruse-site/.github/workflows/other.yml@refs/heads/main" }), NOW), /workflow/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ ref: "refs/heads/dev" }), NOW), /ref/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ sub: "", repository: "Lehibouruse/le-hibou-ruse-site" }), NOW), /subject/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ sub: "repository_id:1367354762", repository: "attacker/other" }), NOW), /repository/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ iat: NOW - 601 }), NOW), /mission/);
});

test("le registre borne les écritures site et branche la chaîne vidéo", () => {
  assert.equal(isAgenticAction("UPDATE_SITE", { objective: "mission globale" }), true);
  assert.equal(isAgenticAction("UPDATE_SITE", { key: "hero" }), false);
  assert.equal(isAgenticAction("CREATE_VIDEO", {}), true);
  const siteNames = toolsForAction("UPDATE_SITE").map((tool) => tool.name);
  const videoNames = toolsForAction("CREATE_VIDEO").map((tool) => tool.name);
  assert.ok(siteNames.includes("site_write"));
  assert.ok(siteNames.includes("site_edit"));
  assert.ok(siteNames.includes("repo_read_many"));
  assert.equal(siteNames.includes("generate_speech"), false);
  assert.ok(videoNames.includes("assemble_video"));
  assert.ok(videoNames.includes("video_qc"));
  assert.ok(videoNames.includes("register_video_draft"));
  assert.equal(videoNames.includes("schedule_post"), false);
});

test("une erreur récupérable passe en Retry avec backoff borné", () => {
  const first = failureDisposition({ retry_count: 0, max_retries: 2 }, 1_000_000);
  assert.equal(first.status, "Retry");
  assert.equal(first.retry_count, 1);
  assert.equal(first.next_run_at, new Date(1_060_000).toISOString());
  const exhausted = failureDisposition({ retry_count: 2, max_retries: 2 }, 1_000_000);
  assert.equal(exhausted.status, "Error");
});

test("l'auto-merge attend explicitement le statut Vercel", () => {
  assert.equal(vercelCommitState([]), "pending");
  assert.equal(vercelCommitState([{ context: "Vercel", state: "pending" }]), "pending");
  assert.equal(vercelCommitState([{ context: "Vercel", state: "success" }]), "success");
  assert.equal(vercelCommitState([{ context: "Vercel", state: "failure" }]), "failure");
});

test("le cron effectue un vrai wake et le dry-run/export restent manuels", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && \(inputs\.dry_run \|\| inputs\.export_book\)/);
  assert.match(workflow, /X-Hibou-Dry-Run/);
  assert.match(workflow, /Wake scheduler and inspect queue/);
  assert.match(workflow, /worker_required=\$worker_required/);
  assert.match(workflow, /steps\.wake\.outputs\.worker_required == 'true'/);
  assert.match(workflow, /steps\.wake\.outputs\.action == 'CREATE_VIDEO'/);
  assert.match(workflow, /HIBOU_BASE_URL:/);
  assert.match(workflow, /vars\.HIBOU_PUBLIC_BASE_URL/);
  assert.match(workflow, /\$\{HIBOU_BASE_URL\}\/api\/wake/);
  assert.match(workflow, new RegExp(`actions/checkout@${CHECKOUT_SHA}`));
  assert.match(workflow, new RegExp(`actions/setup-node@${SETUP_NODE_SHA}`));
});

test("les actions GitHub exécutables sont figées sur des commits immuables", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const wake = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  for (const workflow of [ci, wake]) {
    assert.doesNotMatch(workflow, /uses:\s+actions\/[\w-]+@v\d+/);
    for (const line of workflow.split(/\r?\n/).filter((item) => item.includes("uses: actions/"))) {
      assert.match(line, /uses:\s+actions\/[\w-]+@[a-f0-9]{40}(?:\s+#\s+v\d+)?$/);
    }
  }
  assert.match(ci, new RegExp(`actions/checkout@${CHECKOUT_SHA}`));
  assert.match(ci, new RegExp(`actions/setup-node@${SETUP_NODE_SHA}`));
  assert.match(wake, new RegExp(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`));
});

test("le worker média autorise uniquement son workflow OIDC dédié en plus du wake historique", () => {
  const route = readFileSync(new URL("../app/api/agent-worker/route.js", import.meta.url), "utf8");
  assert.match(route, /allowedWorkflowFiles: \["hibou-wake\.yml", "hibou-media-control\.yml"\]/);
  assert.match(route, /allowedEvents: \["push", "workflow_dispatch", "issue_comment"\]/);
});

test("un Manual Review métier ne casse ni ne rejoue le wake", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  const wake = readFileSync(new URL("../app/api/wake/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /--retry-all-errors/);
  assert.match(workflow, /--retry 2 --retry-delay 1 --retry-max-time 30/);
  assert.match(wake, /HANDLED_BUSINESS_STATUSES = new Set\(\[409, 422\]\)/);
  assert.match(wake, /handled: true/);
  assert.match(wake, /delegated_status: response\.status/);
});

test("le worker autorise assez de tours pour les missions complexes tout en gardant des plafonds", () => {
  const worker = readFileSync(new URL("../scripts/hibou-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /const MAX_AI_CALLS = 32/);
  assert.match(worker, /const MAX_AI_COST_USD = 2/);
  assert.match(worker, /operation: "checkpoint"/);
  const route = readFileSync(new URL("../app/api/agent-worker/route.js", import.meta.url), "utf8");
  assert.match(route, /parallel_tool_calls: true/);
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  assert.match(workflow, /sudo apt-get install -y ffmpeg librsvg2-bin/);
});
