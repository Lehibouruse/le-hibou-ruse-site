import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateGithubActionsClaims } from "../lib/github-oidc.mjs";

const NOW = 2_000_000_000;
const REPOSITORY = "Lehibouruse/le-hibou-ruse-site";
const REF = "refs/heads/main";

function claims(workflowFile, overrides = {}) {
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: "hibou-orchestrator",
    exp: NOW + 300,
    iat: NOW - 10,
    nbf: NOW - 10,
    repository: REPOSITORY,
    ref: REF,
    sub: `repo:${REPOSITORY}:ref:${REF}`,
    workflow_ref: `${REPOSITORY}/.github/workflows/${workflowFile}@${REF}`,
    event_name: "schedule",
    ...overrides,
  };
}

test("l'allowlist OIDC route-scoped accepte uniquement le workflow demandé", () => {
  const watchdog = claims("system-watchdog.yml");
  assert.equal(
    validateGithubActionsClaims(watchdog, NOW, { allowedWorkflowFiles: ["system-watchdog.yml"] }).workflow_ref,
    watchdog.workflow_ref,
  );
  assert.throws(
    () => validateGithubActionsClaims(watchdog, NOW, { allowedWorkflowFiles: ["domain-verify.yml"] }),
    /workflow/,
  );
});

test("sans option, la compatibilité historique reste limitée à hibou-wake", () => {
  assert.equal(validateGithubActionsClaims(claims("hibou-wake.yml"), NOW).event_name, "schedule");
  assert.throws(() => validateGithubActionsClaims(claims("system-watchdog.yml"), NOW), /workflow/);
});

test("un nom de workflow injecté hors dossier GitHub Actions est refusé", () => {
  assert.throws(
    () => validateGithubActionsClaims(claims("system-watchdog.yml"), NOW, { allowedWorkflowFiles: ["../system-watchdog.yml"] }),
    /workflow file/,
  );
});

test("chaque route planifiée est liée à son workflow exact", () => {
  const routes = [
    ["../app/api/domain-verify/route.js", "domain-verify.yml"],
    ["../app/api/system-watchdog/route.js", "system-watchdog.yml"],
    ["../app/api/social-metrics/route.js", "social-metrics.yml"],
    ["../app/api/growth-experiments/route.js", "social-metrics.yml"],
    ["../app/api/social/control-plane/route.js", "social-control-plane-sync.yml"],
  ];

  for (const [path, workflowFile] of routes) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, new RegExp(`OIDC_WORKFLOW = "${workflowFile.replaceAll(".", "\\.")}"`));
    assert.match(source, /allowedWorkflowFiles: \[OIDC_WORKFLOW\]/);
  }
});
