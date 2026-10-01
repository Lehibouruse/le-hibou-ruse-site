import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  auditE2EPlan,
  E2E_PLAN_AUDIT_SCHEMA,
  selectRunnableE2ESteps,
} from "../scripts/video-e2e-plan-audit.mjs";

function realPlan() {
  return JSON.parse(
    readFileSync(
      new URL("../docs/video-studio-v5-e2e-plan.json", import.meta.url),
      "utf8",
    ),
  );
}

test("real V5 E2E plan is structurally safe and non-executing", () => {
  const audit = auditE2EPlan(realPlan());

  assert.equal(audit.schema, E2E_PLAN_AUDIT_SCHEMA);
  assert.equal(audit.valid, true);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.step_count, 13);
  assert.equal(audit.automatic_execution_performed, false);
  assert.equal(audit.gpu_execution_performed, false);
  assert.equal(audit.process_control_performed, false);
  assert.equal(audit.filesystem_mutation_performed, false);
  assert.equal(audit.publication_authorized, false);
});

test("GPU or process-control step without local idle and disposable run is rejected", () => {
  const plan = realPlan();
  const step = plan.steps.find((row) => row.id === "E2E-09");
  step.requires_local_idle = false;
  step.disposable_run_required = false;

  const audit = auditE2EPlan(plan);

  assert.equal(audit.valid, false);
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "local_idle_required_for_resource_class" &&
        row.detail.step_id === "E2E-09",
    ),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "disposable_run_required_for_active_resource" &&
        row.detail.step_id === "E2E-09",
    ),
    true,
  );
});

test("manual start and publication lock are mandatory on every E2E step", () => {
  const plan = realPlan();
  const step = plan.steps.find((row) => row.id === "E2E-02");
  step.manual_start_required = false;
  step.publication_authorized = true;

  const audit = auditE2EPlan(plan);

  assert.equal(audit.valid, false);
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "manual_start_required" &&
        row.detail === "E2E-02",
    ),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "step_publication_must_be_false" &&
        row.detail === "E2E-02",
    ),
    true,
  );
});

test("dependency must exist and precede its consumer", () => {
  const plan = realPlan();
  const step = plan.steps.find((row) => row.id === "E2E-02");
  step.dependencies = ["E2E-11", "E2E-99"];

  const audit = auditE2EPlan(plan);

  assert.equal(audit.valid, false);
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "dependency_must_precede_step" &&
        row.detail.dependency === "E2E-11",
    ),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "dependency_missing" &&
        row.detail.dependency === "E2E-99",
    ),
    true,
  );
});

test("automatic execution and missing global guards fail closed", () => {
  const plan = realPlan();
  plan.automatic_execution = true;
  plan.publication_authorized = true;
  plan.policy.active_render_must_not_be_disturbed = false;

  const audit = auditE2EPlan(plan);

  assert.equal(audit.valid, false);
  assert.equal(
    audit.errors.some(
      (row) => row.code === "automatic_execution_must_be_false",
    ),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) => row.code === "publication_authorized_must_be_false",
    ),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "required_policy_guard_missing" &&
        row.detail.key === "active_render_must_not_be_disturbed",
    ),
    true,
  );
});

test("feature flags must be unique and constrained to HIBOU_VIDEO namespace", () => {
  const plan = realPlan();
  const step = plan.steps.find((row) => row.id === "E2E-11");
  step.feature_flags_temporarily_enabled.push(
    "HIBOU_VIDEO_TIMELINE_V1",
    "UNSAFE_EXTERNAL_FLAG",
  );

  const audit = auditE2EPlan(plan);

  assert.equal(audit.valid, false);
  assert.equal(
    audit.errors.some((row) => row.code === "duplicate_feature_flag"),
    true,
  );
  assert.equal(
    audit.errors.some(
      (row) =>
        row.code === "invalid_feature_flag" &&
        row.detail.flag === "UNSAFE_EXTERNAL_FLAG",
    ),
    true,
  );
});

test("runnable selector never treats idle-required work as runnable without idle confirmation", () => {
  const plan = realPlan();
  const selected = selectRunnableE2ESteps(plan, {
    completed_ids: ["E2E-00"],
    local_idle: false,
  });

  assert.equal(selected.valid_plan, true);
  assert.equal(selected.execution_performed, false);
  assert.equal(selected.publication_authorized, false);
  assert.equal(
    selected.runnable.some((row) => row.step_id === "E2E-01"),
    false,
  );
  const timeline = selected.blocked.find(
    (row) => row.step_id === "E2E-01",
  );
  assert.equal(
    timeline.blocked_reasons.includes(
      "local_idle_confirmation_required",
    ),
    true,
  );
});

test("runnable selector exposes only dependency-complete steps after explicit idle confirmation", () => {
  const plan = realPlan();
  const selected = selectRunnableE2ESteps(plan, {
    completed_ids: ["E2E-00"],
    local_idle: true,
  });

  const runnableIds = selected.runnable.map((row) => row.step_id);
  assert.equal(runnableIds.includes("E2E-01"), true);
  assert.equal(runnableIds.includes("E2E-02"), true);
  assert.equal(runnableIds.includes("E2E-04"), true);
  assert.equal(runnableIds.includes("E2E-11"), false);
  assert.equal(
    selected.runnable.every(
      (row) =>
        row.requires_manual_start === true &&
        row.publication_authorized === false,
    ),
    true,
  );
});

test("invalid plan produces no runnable work", () => {
  const plan = realPlan();
  plan.steps[0].manual_start_required = false;

  const selected = selectRunnableE2ESteps(plan, {
    completed_ids: [],
    local_idle: true,
  });

  assert.equal(selected.valid_plan, false);
  assert.deepEqual(selected.runnable, []);
  assert.deepEqual(selected.blocked, []);
  assert.equal(selected.execution_performed, false);
});
