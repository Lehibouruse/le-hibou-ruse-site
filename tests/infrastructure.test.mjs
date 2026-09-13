import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESERVED_JOB_IDS, eligibleJobsFormula, reservedJobIds } from "../lib/job-eligibility.mjs";
import { validateGithubActionsClaims } from "../lib/github-oidc.mjs";
import { isAgenticAction, toolsForAction } from "../lib/agent-capabilities.mjs";
import { failureDisposition, vercelCommitState } from "../lib/agent-runtime.mjs";

const NOW = 2_000_000_000;

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
  assert.equal(validateGithubActionsClaims(validClaims({ sub: "repo:Lehibouruse/le-hibou-ruse-site:environment:Production" }), NOW).ref, "refs/heads/main");
  assert.throws(() => validateGithubActionsClaims(validClaims({ workflow_ref: "Lehibouruse/le-hibou-ruse-site/.github/workflows/other.yml@refs/heads/main" }), NOW), /workflow/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ ref: "refs/heads/dev" }), NOW), /ref/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ sub: "repo:attacker/other:ref:refs/heads/main" }), NOW), /subject/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ iat: NOW - 601 }), NOW), /mission/);
});

test("le registre borne les écritures site et branche la chaîne vidéo", () => {
  assert.equal(isAgenticAction("UPDATE_SITE", { objective: "mission globale" }), true);
  assert.equal(isAgenticAction("UPDATE_SITE", { key: "hero" }), false);
  assert.equal(isAgenticAction("CREATE_VIDEO", {}), true);
  const siteNames = toolsForAction("UPDATE_SITE").map((tool) => tool.name);
  const videoNames = toolsForAction("CREATE_VIDEO").map((tool) => tool.name);
  assert.ok(siteNames.includes("site_write"));
  assert.equal(siteNames.includes("generate_speech"), false);
  assert.ok(videoNames.includes("assemble_video"));
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
