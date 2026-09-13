import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESERVED_JOB_IDS, eligibleJobsFormula, reservedJobIds } from "../lib/job-eligibility.mjs";
import { validateGithubActionsClaims } from "../lib/github-oidc.mjs";

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
  assert.throws(() => validateGithubActionsClaims(validClaims({ workflow_ref: "Lehibouruse/le-hibou-ruse-site/.github/workflows/other.yml@refs/heads/main" }), NOW), /workflow/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ ref: "refs/heads/dev" }), NOW), /ref/);
  assert.throws(() => validateGithubActionsClaims(validClaims({ iat: NOW - 601 }), NOW), /mission/);
});
