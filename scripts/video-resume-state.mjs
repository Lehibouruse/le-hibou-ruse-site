#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pipelineStateFingerprint } from "./video-resume-plan.mjs";

export const RESUME_STATE_SCHEMA = "HIBOU_VIDEO_RESUME_STATE_PREP_V1";

function fail(message) {
  throw new Error(message);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function prepareResumeState({
  state,
  plan,
  planSha256,
  preparedAt = new Date().toISOString(),
} = {}) {
  if (state?.schema !== "HIBOU_VIDEO_MASTER_RUN_V1") {
    fail("HIBOU_VIDEO_MASTER_RUN_V1 required");
  }
  if (plan?.schema !== "HIBOU_VIDEO_RESUME_PLAN_V1") {
    fail("HIBOU_VIDEO_RESUME_PLAN_V1 required");
  }
  const expectedStateSha = String(plan.source_state_sha256 || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedStateSha)) {
    fail("resume plan source_state_sha256 missing or invalid");
  }
  const actualStateSha = pipelineStateFingerprint(state);
  if (actualStateSha !== expectedStateSha) {
    fail("resume plan is stale: pipeline state fingerprint mismatch");
  }
  if (!/^[0-9a-f]{64}$/i.test(String(planSha256 || ""))) {
    fail("valid resume plan sha256 required");
  }
  if (plan.execution_performed === true) {
    fail("resume plan must be planning-only");
  }
  if (!Array.isArray(plan.stages_to_reset) || !plan.stages_to_reset.length) {
    fail("resume plan has no stages_to_reset");
  }

  const running = Object.entries(state.stages || {})
    .filter(([, info]) => info?.status === "RUNNING")
    .map(([name]) => name);
  if (running.length) {
    fail("cannot prepare resume while stages are RUNNING: " + running.join(","));
  }

  const next = structuredClone(state);
  next.stages ||= {};
  next.resume_history = Array.isArray(next.resume_history)
    ? next.resume_history
    : [];

  const priorStages = {};
  const resetStages = [];
  for (const stage of plan.stages_to_reset) {
    const name = String(stage || "").trim();
    if (!name) continue;
    priorStages[name] = next.stages[name] || null;
    delete next.stages[name];
    resetStages.push(name);
  }

  next.pipeline_status = "RESUME_PREPARED";
  next.resume_prepared = {
    schema: RESUME_STATE_SCHEMA,
    prepared_at: preparedAt,
    plan_sha256: String(planSha256).toLowerCase(),
    source_state_sha256: actualStateSha,
    resume_stage: plan.resume_stage || resetStages[0] || null,
    reset_stages: resetStages,
    preserve_artifacts: true,
    preserve_caches: true,
    execution_started: false,
    publication_authorized: false,
  };
  next.resume_history.push({
    prepared_at: preparedAt,
    plan_sha256: String(planSha256).toLowerCase(),
    source_state_sha256: actualStateSha,
    resume_stage: next.resume_prepared.resume_stage,
    reset_stages: resetStages,
    prior_stages: priorStages,
    artifacts_deleted: false,
    caches_deleted: false,
    execution_started: false,
    publication_authorized: false,
  });

  return {
    schema: RESUME_STATE_SCHEMA,
    state: next,
    reset_stages: resetStages,
    prior_stages: priorStages,
    policy: {
      stage_state_only: true,
      artifacts_deleted: false,
      caches_deleted: false,
      execution_started: false,
      publication_authorized: false,
    },
    publication_authorized: false,
  };
}

export function validateResumeApply({
  root,
  plan,
  planPath,
  confirmPlanSha256,
  applyEnabled,
} = {}) {
  const resolvedRoot = resolve(String(root || ""));
  const expectedRoot = resolve(String(plan?.root || ""));
  if (!String(root || "").trim()) fail("render root required");
  if (resolvedRoot !== expectedRoot) {
    fail("resume plan root does not match requested render root");
  }
  if (applyEnabled !== true) {
    fail("HIBOU_VIDEO_RESUME_APPLY_ENABLED=true required");
  }
  const actualPlanSha = sha256File(resolve(planPath));
  const confirmed = String(confirmPlanSha256 || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(confirmed) || confirmed !== actualPlanSha) {
    fail("resume plan sha256 confirmation mismatch");
  }
  return {
    root: resolvedRoot,
    plan_sha256: actualPlanSha,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const [rootArg, planArg] = positionals;
  const apply = args.includes("--apply");
  const confirmArg = args.find((arg) =>
    arg.startsWith("--confirm-plan-sha256="),
  );
  const confirmPlanSha256 = confirmArg
    ? confirmArg.slice("--confirm-plan-sha256=".length)
    : "";

  if (!rootArg || !planArg) {
    fail(
      "usage: node scripts/video-resume-state.mjs <render-root> <resume-plan.json> [--apply --confirm-plan-sha256=<sha256>]",
    );
  }

  const root = resolve(rootArg);
  const statePath = resolve(root, "pipeline-run.json");
  const planPath = resolve(planArg);
  if (!existsSync(statePath)) fail("pipeline-run.json missing");
  if (!existsSync(planPath)) fail("resume plan missing");

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (resolve(String(plan?.root || "")) !== root) {
    fail("resume plan root does not match requested render root");
  }
  const actualPlanSha256 = sha256File(planPath);
  const preview = prepareResumeState({
    state,
    plan,
    planSha256: actualPlanSha256,
  });

  if (!apply) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dry_run: true,
        schema: preview.schema,
        resume_stage: preview.state.resume_prepared.resume_stage,
        reset_stages: preview.reset_stages,
        plan_sha256: actualPlanSha256,
        artifacts_deleted: false,
        caches_deleted: false,
        execution_started: false,
        publication_authorized: false,
      }) + "\n",
    );
    process.exit(0);
  }

  const validated = validateResumeApply({
    root,
    plan,
    planPath,
    confirmPlanSha256,
    applyEnabled:
      String(process.env.HIBOU_VIDEO_RESUME_APPLY_ENABLED || "")
        .trim()
        .toLowerCase() === "true",
  });

  const backupPath = resolve(
    dirname(statePath),
    basename(statePath, ".json") +
      ".before-resume-" +
      safeTimestamp() +
      ".json",
  );
  copyFileSync(statePath, backupPath);
  writeFileSync(
    statePath,
    JSON.stringify(preview.state, null, 2) + "\n",
    "utf8",
  );

  process.stdout.write(
    JSON.stringify({
      ok: true,
      dry_run: false,
      applied: true,
      schema: preview.schema,
      root: validated.root,
      plan_sha256: validated.plan_sha256,
      resume_stage: preview.state.resume_prepared.resume_stage,
      reset_stages: preview.reset_stages,
      backup_path: backupPath,
      artifacts_deleted: false,
      caches_deleted: false,
      execution_started: false,
      publication_authorized: false,
    }) + "\n",
  );
}
