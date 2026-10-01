#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const E2E_PLAN_SCHEMA = "HIBOU_VIDEO_V5_E2E_PLAN_V1";
export const E2E_PLAN_AUDIT_SCHEMA = "HIBOU_VIDEO_V5_E2E_PLAN_AUDIT_V1";

const IDLE_REQUIRED_CLASSES = new Set([
  "cpu_media",
  "cpu_audio",
  "gpu",
  "gpu_audio",
  "gpu_human",
  "process_control",
  "process_control_gpu",
]);

function fail(message) {
  throw new Error(message);
}

function strings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function unique(values) {
  return [...new Set(values)];
}

function finding(code, detail = null) {
  return detail == null ? { code } : { code, detail };
}

function validateFeatureFlags(step, errors) {
  const flags = strings(step.feature_flags_temporarily_enabled);
  if (flags.length !== unique(flags).length) {
    errors.push(finding("duplicate_feature_flag", step.id));
  }
  for (const flag of flags) {
    if (!/^HIBOU_VIDEO_[A-Z0-9_]+$/.test(flag)) {
      errors.push(
        finding("invalid_feature_flag", {
          step_id: step.id,
          flag,
        }),
      );
    }
  }
  return flags;
}

export function auditE2EPlan(plan) {
  if (plan?.schema !== E2E_PLAN_SCHEMA) {
    fail(E2E_PLAN_SCHEMA + " required");
  }

  const errors = [];
  const warnings = [];
  const steps = Array.isArray(plan.steps) ? plan.steps : [];

  if (plan.automatic_execution !== false) {
    errors.push(finding("automatic_execution_must_be_false"));
  }
  if (plan.publication_authorized !== false) {
    errors.push(finding("publication_authorized_must_be_false"));
  }

  for (const key of [
    "active_render_must_not_be_disturbed",
    "explicit_local_idle_confirmation_required_for_media_execution",
    "disposable_run_required_for_gpu_and_process_control",
    "restore_feature_flags_after_each_test",
    "publication_must_remain_disabled",
    "no_paid_fallback",
    "human_review_required",
  ]) {
    if (plan?.policy?.[key] !== true) {
      errors.push(
        finding("required_policy_guard_missing", {
          key,
        }),
      );
    }
  }

  if (!steps.length) {
    errors.push(finding("e2e_steps_required"));
  }

  const idSet = new Set();
  const orderSet = new Set();
  const stepById = new Map();

  for (const step of steps) {
    const id = String(step?.id || "").trim();
    const order = Number(step?.order);

    if (!/^E2E-[0-9]{2,3}$/.test(id)) {
      errors.push(finding("invalid_step_id", id || null));
    }
    if (idSet.has(id)) {
      errors.push(finding("duplicate_step_id", id));
    }
    idSet.add(id);

    if (!Number.isInteger(order) || order < 0) {
      errors.push(
        finding("invalid_step_order", {
          step_id: id || null,
          order: step?.order ?? null,
        }),
      );
    } else if (orderSet.has(order)) {
      errors.push(finding("duplicate_step_order", order));
    }
    orderSet.add(order);
    stepById.set(id, step);

    if (step?.manual_start_required !== true) {
      errors.push(finding("manual_start_required", id));
    }
    if (step?.publication_authorized !== false) {
      errors.push(finding("step_publication_must_be_false", id));
    }
    if (step?.restore_flags_after !== true) {
      errors.push(finding("restore_flags_after_required", id));
    }
    if (!strings(step?.actions).length) {
      errors.push(finding("step_actions_required", id));
    }
    if (!strings(step?.acceptance).length) {
      errors.push(finding("step_acceptance_required", id));
    }

    const resourceClass = String(step?.resource_class || "").trim();
    const idleRequired = IDLE_REQUIRED_CLASSES.has(resourceClass);

    if (idleRequired && step?.requires_local_idle !== true) {
      errors.push(
        finding("local_idle_required_for_resource_class", {
          step_id: id,
          resource_class: resourceClass,
        }),
      );
    }

    if (
      idleRequired &&
      resourceClass !== "cpu_readonly" &&
      step?.disposable_run_required !== true
    ) {
      errors.push(
        finding("disposable_run_required_for_active_resource", {
          step_id: id,
          resource_class: resourceClass,
        }),
      );
    }

    if (
      resourceClass === "cpu_readonly" &&
      step?.requires_local_idle === true
    ) {
      warnings.push(
        finding("readonly_step_unnecessarily_requires_idle", id),
      );
    }

    validateFeatureFlags(step, errors);
  }

  for (const step of steps) {
    const id = String(step?.id || "").trim();
    const order = Number(step?.order);
    const dependencies = strings(step?.dependencies);

    if (dependencies.length !== unique(dependencies).length) {
      errors.push(finding("duplicate_dependency", id));
    }
    if (dependencies.includes(id)) {
      errors.push(finding("self_dependency", id));
    }

    for (const dependency of dependencies) {
      const parent = stepById.get(dependency);
      if (!parent) {
        errors.push(
          finding("dependency_missing", {
            step_id: id,
            dependency,
          }),
        );
        continue;
      }
      if (
        Number.isInteger(order) &&
        Number.isInteger(Number(parent.order)) &&
        Number(parent.order) >= order
      ) {
        errors.push(
          finding("dependency_must_precede_step", {
            step_id: id,
            step_order: order,
            dependency,
            dependency_order: Number(parent.order),
          }),
        );
      }
    }
  }

  const orderedSteps = [...steps].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );
  const expectedOrders = orderedSteps.map((_, index) => index);
  const actualOrders = orderedSteps.map((step) => Number(step.order));
  if (
    expectedOrders.length === actualOrders.length &&
    expectedOrders.some((expected, index) => expected !== actualOrders[index])
  ) {
    warnings.push(
      finding("step_orders_are_not_contiguous", {
        expected: expectedOrders,
        actual: actualOrders,
      }),
    );
  }

  return {
    schema: E2E_PLAN_AUDIT_SCHEMA,
    source_schema: plan.schema,
    step_count: steps.length,
    errors,
    warnings,
    valid: errors.length === 0,
    automatic_execution_performed: false,
    gpu_execution_performed: false,
    process_control_performed: false,
    filesystem_mutation_performed: false,
    publication_authorized: false,
    policy: {
      audit_is_read_only: true,
      audit_never_starts_e2e: true,
      local_idle_is_runtime_input_not_inferred: true,
      manual_start_is_always_required: true,
      publication_never_authorized: true,
    },
  };
}

export function selectRunnableE2ESteps(
  plan,
  {
    completed_ids = [],
    local_idle = false,
  } = {},
) {
  const audit = auditE2EPlan(plan);
  if (!audit.valid) {
    return {
      schema: "HIBOU_VIDEO_V5_E2E_RUNNABLE_V1",
      valid_plan: false,
      runnable: [],
      blocked: [],
      errors: audit.errors,
      execution_performed: false,
      publication_authorized: false,
    };
  }

  const completed = new Set(strings(completed_ids));
  const rows = [...plan.steps]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .filter((step) => !completed.has(String(step.id)))
    .map((step) => {
      const dependencies = strings(step.dependencies);
      const missingDependencies = dependencies.filter(
        (dependency) => !completed.has(dependency),
      );
      const idleBlocked =
        step.requires_local_idle === true && local_idle !== true;
      const runnable =
        missingDependencies.length === 0 &&
        !idleBlocked &&
        step.manual_start_required === true;

      return {
        step_id: String(step.id),
        order: Number(step.order),
        runnable,
        requires_manual_start: true,
        requires_local_idle: step.requires_local_idle === true,
        missing_dependencies: missingDependencies,
        blocked_reasons: [
          ...(missingDependencies.length
            ? ["dependencies_incomplete"]
            : []),
          ...(idleBlocked ? ["local_idle_confirmation_required"] : []),
        ],
        publication_authorized: false,
      };
    });

  return {
    schema: "HIBOU_VIDEO_V5_E2E_RUNNABLE_V1",
    valid_plan: true,
    local_idle_confirmed: local_idle === true,
    completed_ids: [...completed],
    runnable: rows.filter((row) => row.runnable),
    blocked: rows.filter((row) => !row.runnable),
    execution_performed: false,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [planPath, outputPath] = process.argv.slice(2);
  if (!planPath) {
    fail(
      "usage: node scripts/video-e2e-plan-audit.mjs <e2e-plan.json> [audit.json]",
    );
  }

  const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
  const report = auditE2EPlan(plan);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (outputPath) writeFileSync(resolve(outputPath), json, "utf8");
  process.stdout.write(json);
  if (!report.valid) process.exitCode = 2;
}
