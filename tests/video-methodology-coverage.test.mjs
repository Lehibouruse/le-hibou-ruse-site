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

test("methodology coverage map has static code and test evidence for every tracked step", () => {
  const report = auditMethodologyCoverage(map);

  assert.equal(report.schema, METHODOLOGY_COVERAGE_SCHEMA);
  assert.equal(report.step_count, map.steps.length);
  assert.equal(report.static_coverage_pass, true);
  assert.deepEqual(report.failed_steps, []);
  assert.equal(report.missing_file_count, 0);
  assert.equal(report.missing_marker_count, 0);
  assert.equal(report.summary.activated, 0);
  assert.equal(report.publication_authorized, false);
});

test("coverage audit keeps E2E and activation distinct from code presence", () => {
  const report = auditMethodologyCoverage(map);

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
  assert.equal(report.steps.every((step) => step.active === false), true);
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
