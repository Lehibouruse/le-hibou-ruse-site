import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  auditMethodologyCoverage,
  METHODOLOGY_COVERAGE_SCHEMA,
} from "../scripts/video-methodology-coverage.mjs";

const map = JSON.parse(
  readFileSync(
    new URL("../docs/video-methodology-coverage-v5.json", import.meta.url),
    "utf8",
  ),
);

const e2ePlan = JSON.parse(
  readFileSync(
    new URL("../docs/video-studio-v5-e2e-plan.json", import.meta.url),
    "utf8",
  ),
);

test("methodology coverage map has static code and test evidence for every tracked step", () => {
  const report = auditMethodologyCoverage(map, { e2ePlan });

  assert.equal(report.schema, METHODOLOGY_COVERAGE_SCHEMA);
  assert.equal(report.step_count, map.steps.length);
  assert.equal(report.static_coverage_pass, true);
  assert.equal(report.e2e_linkage_pass, true);
  assert.equal(report.activation_policy_pass, true);
  assert.equal(report.coverage_contract_pass, true);
  assert.deepEqual(report.failed_steps, []);
  assert.deepEqual(report.e2e_linkage_failed_steps, []);
  assert.deepEqual(report.activation_policy_failed_steps, []);
  assert.equal(report.missing_file_count, 0);
  assert.equal(report.missing_marker_count, 0);
  assert.equal(report.missing_e2e_reference_count, 0);
  assert.equal(report.summary.activated, 0);
  assert.equal(report.publication_authorized, false);
});

test("coverage audit keeps E2E and activation distinct from code presence", () => {
  const report = auditMethodologyCoverage(map, { e2ePlan });

  assert.equal(
    report.policy.static_coverage_does_not_equal_e2e_validation,
    true,
  );
  assert.equal(
    report.policy.e2e_validation_does_not_equal_activation,
    true,
  );
  assert.equal(report.policy.activation_remains_explicit, true);
  assert.equal(report.summary.e2e_pending > 0, true);
  assert.equal(report.summary.e2e_validated, 0);
  assert.equal(report.steps.every((step) => step.active === false), true);
  assert.equal(
    report.steps.every(
      (step) =>
        step.activation_status === "inactive" &&
        step.activation_requires_explicit_human_action === true,
    ),
    true,
  );
  assert.equal(
    report.steps
      .filter((step) => step.e2e_pending)
      .every(
        (step) =>
          step.e2e_status === "pending" &&
          step.e2e_step_ids.length > 0 &&
          step.e2e_linkage_pass === true,
      ),
    true,
  );
});

test("coverage audit rejects duplicate step ids", () => {
  const broken = structuredClone(map);
  broken.steps.push(structuredClone(broken.steps[0]));

  assert.throws(
    () => auditMethodologyCoverage(broken),
    /duplicate methodology coverage step id/,
  );
});

test("coverage audit reports missing files instead of silently passing", () => {
  const broken = structuredClone(map);
  broken.steps[0].code.push({ path: "scripts/does-not-exist.mjs" });

  const report = auditMethodologyCoverage(broken);
  assert.equal(report.static_coverage_pass, false);
  assert.equal(report.failed_steps.includes(broken.steps[0].id), true);
  assert.equal(report.missing_file_count, 1);
});


test("coverage audit rejects unknown E2E step references", () => {
  const broken = structuredClone(map);
  const step = broken.steps.find((row) => row.e2e_pending === true);
  step.e2e_step_ids.push("E2E-999");

  const report = auditMethodologyCoverage(broken, { e2ePlan });

  assert.equal(report.e2e_linkage_pass, false);
  assert.equal(report.coverage_contract_pass, false);
  assert.equal(report.missing_e2e_reference_count, 1);
  assert.equal(
    report.e2e_linkage_failed_steps.includes(step.id),
    true,
  );
  assert.equal(
    report.steps
      .find((row) => row.id === step.id)
      .e2e_linkage_errors.includes("unknown_e2e_step:E2E-999"),
    true,
  );
});

test("coverage audit rejects pending E2E step without a linked test", () => {
  const broken = structuredClone(map);
  const step = broken.steps.find((row) => row.e2e_pending === true);
  step.e2e_step_ids = [];

  const report = auditMethodologyCoverage(broken, { e2ePlan });

  assert.equal(report.e2e_linkage_pass, false);
  assert.equal(report.coverage_contract_pass, false);
  assert.equal(
    report.steps
      .find((row) => row.id === step.id)
      .e2e_linkage_errors.includes("pending_step_has_no_e2e_link"),
    true,
  );
});

test("coverage audit forbids activation while required E2E is still pending", () => {
  const broken = structuredClone(map);
  const step = broken.steps.find((row) => row.e2e_pending === true);
  step.activation_status = "active";

  const report = auditMethodologyCoverage(broken, { e2ePlan });

  assert.equal(report.activation_policy_pass, false);
  assert.equal(report.coverage_contract_pass, false);
  assert.equal(
    report.activation_policy_failed_steps.includes(step.id),
    true,
  );
  assert.equal(
    report.steps
      .find((row) => row.id === step.id)
      .activation_errors.includes("active_step_requires_validated_e2e"),
    true,
  );
});

test("future activation still requires explicit human activation guard", () => {
  const broken = structuredClone(map);
  broken.steps[0].activation_requires_explicit_human_action = false;

  const report = auditMethodologyCoverage(broken, { e2ePlan });

  assert.equal(report.activation_policy_pass, false);
  assert.equal(
    report.steps[0].activation_errors.includes(
      "explicit_human_activation_guard_missing",
    ),
    true,
  );
});
