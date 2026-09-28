#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const METHODOLOGY_COVERAGE_SCHEMA =
  "HIBOU_VIDEO_METHODOLOGY_COVERAGE_AUDIT_V1";

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function checkFile(spec) {
  const path = typeof spec === "string" ? spec : spec?.path;
  const markers = typeof spec === "string" ? [] : asArray(spec?.markers);
  if (!path) return { path: null, exists: false, markers: [], ok: false };

  const absolute = resolve(path);
  const exists = existsSync(absolute);
  const markerResults = [];

  if (exists) {
    const source = read(absolute);
    for (const marker of markers) {
      markerResults.push({
        marker: String(marker),
        present: source.includes(String(marker)),
      });
    }
  } else {
    for (const marker of markers) {
      markerResults.push({
        marker: String(marker),
        present: false,
      });
    }
  }

  return {
    path,
    exists,
    markers: markerResults,
    ok: exists && markerResults.every((item) => item.present),
  };
}

export function auditMethodologyCoverage(
  map,
  { e2ePlan = null } = {},
) {
  if (map?.schema !== "HIBOU_VIDEO_METHODOLOGY_COVERAGE_V1") {
    fail("HIBOU_VIDEO_METHODOLOGY_COVERAGE_V1 required");
  }

  const seen = new Set();
  const steps = [];
  let missingFileCount = 0;
  let missingMarkerCount = 0;
  let missingE2EReferenceCount = 0;
  let activationPolicyFailureCount = 0;

  const e2eStepIds = new Set();
  if (e2ePlan) {
    if (e2ePlan?.schema !== "HIBOU_VIDEO_V5_E2E_PLAN_V1") {
      fail("HIBOU_VIDEO_V5_E2E_PLAN_V1 required for E2E linkage");
    }
    for (const step of asArray(e2ePlan.steps)) {
      const id = String(step?.id || "").trim();
      if (id) e2eStepIds.add(id);
    }
  }

  for (const step of asArray(map.steps)) {
    const id = String(step?.id || "").trim();
    if (!id) fail("methodology coverage step id is required");
    if (seen.has(id)) fail(`duplicate methodology coverage step id: ${id}`);
    seen.add(id);

    const codeChecks = asArray(step.code).map(checkFile);
    const testChecks = asArray(step.tests).map(checkFile);
    const allChecks = [...codeChecks, ...testChecks];

    missingFileCount += allChecks.filter((item) => !item.exists).length;
    missingMarkerCount += allChecks.reduce(
      (sum, item) =>
        sum + item.markers.filter((marker) => !marker.present).length,
      0,
    );

    const staticCoveragePass =
      codeChecks.length > 0
      && testChecks.length > 0
      && allChecks.every((item) => item.ok);

    const e2ePending = step?.e2e_pending === true;
    const e2eStatus = String(
      step?.e2e_status || (e2ePending ? "pending" : "not_required"),
    ).trim();
    const linkedE2ESteps = [
      ...new Set(
        asArray(step?.e2e_step_ids)
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ];
    const activationStatus = String(
      step?.activation_status || "inactive",
    ).trim().toLowerCase();
    const activationRequiresHuman =
      step?.activation_requires_explicit_human_action === true;

    const e2eLinkErrors = [];
    if (e2ePending && !linkedE2ESteps.length) {
      e2eLinkErrors.push("pending_step_has_no_e2e_link");
      missingE2EReferenceCount += 1;
    }
    if (e2ePlan) {
      for (const e2eId of linkedE2ESteps) {
        if (!e2eStepIds.has(e2eId)) {
          e2eLinkErrors.push("unknown_e2e_step:" + e2eId);
          missingE2EReferenceCount += 1;
        }
      }
    }

    if (
      e2ePending &&
      !["pending", "validated"].includes(e2eStatus)
    ) {
      e2eLinkErrors.push("invalid_pending_e2e_status:" + e2eStatus);
    }
    if (!e2ePending && e2eStatus !== "not_required") {
      e2eLinkErrors.push("unexpected_e2e_status:" + e2eStatus);
    }

    const activationErrors = [];
    if (!["inactive", "active"].includes(activationStatus)) {
      activationErrors.push(
        "invalid_activation_status:" + activationStatus,
      );
    }
    if (!activationRequiresHuman) {
      activationErrors.push(
        "explicit_human_activation_guard_missing",
      );
    }
    if (
      activationStatus === "active" &&
      e2eStatus !== "validated" &&
      e2eStatus !== "not_required"
    ) {
      activationErrors.push(
        "active_step_requires_validated_e2e",
      );
    }
    activationPolicyFailureCount += activationErrors.length;

    steps.push({
      id,
      label: String(step?.label || ""),
      static_coverage_pass: staticCoveragePass,
      code: codeChecks,
      tests: testChecks,
      e2e_pending: e2ePending,
      e2e_status: e2eStatus,
      e2e_step_ids: linkedE2ESteps,
      e2e_linkage_pass: e2eLinkErrors.length === 0,
      e2e_linkage_errors: e2eLinkErrors,
      activation_status: activationStatus,
      activation_requires_explicit_human_action:
        activationRequiresHuman,
      activation_policy: step?.activation_policy || null,
      activation_policy_pass: activationErrors.length === 0,
      activation_errors: activationErrors,
      active: activationStatus === "active",
    });
  }

  const failedSteps = steps
    .filter((step) => !step.static_coverage_pass)
    .map((step) => step.id);
  const e2eLinkageFailedSteps = steps
    .filter((step) => !step.e2e_linkage_pass)
    .map((step) => step.id);
  const activationPolicyFailedSteps = steps
    .filter((step) => !step.activation_policy_pass)
    .map((step) => step.id);
  const staticCoveragePass = failedSteps.length === 0;
  const e2eLinkagePass = e2eLinkageFailedSteps.length === 0;
  const activationPolicyPass =
    activationPolicyFailedSteps.length === 0;
  const coverageContractPass =
    staticCoveragePass &&
    e2eLinkagePass &&
    activationPolicyPass;

  return {
    schema: METHODOLOGY_COVERAGE_SCHEMA,
    method_version: map.method_version || null,
    source: map.source || null,
    step_count: steps.length,
    static_coverage_pass: staticCoveragePass,
    e2e_linkage_pass: e2eLinkagePass,
    activation_policy_pass: activationPolicyPass,
    coverage_contract_pass: coverageContractPass,
    failed_steps: failedSteps,
    e2e_linkage_failed_steps: e2eLinkageFailedSteps,
    activation_policy_failed_steps: activationPolicyFailedSteps,
    missing_file_count: missingFileCount,
    missing_marker_count: missingMarkerCount,
    missing_e2e_reference_count: missingE2EReferenceCount,
    activation_policy_failure_count: activationPolicyFailureCount,
    steps,
    summary: {
      coded_and_statically_covered:
        steps.filter((step) => step.static_coverage_pass).length,
      e2e_pending:
        steps.filter((step) => step.e2e_pending).length,
      e2e_validated:
        steps.filter((step) => step.e2e_status === "validated").length,
      activated:
        steps.filter((step) => step.active).length,
    },
    policy: {
      static_coverage_does_not_equal_e2e_validation: true,
      e2e_validation_does_not_equal_activation: true,
      activation_remains_explicit: true,
      e2e_links_are_checked_against_machine_readable_plan:
        Boolean(e2ePlan),
      active_step_requires_validated_or_not_required_e2e: true,
      per_step_human_activation_guard_required: true,
      publication_authorized: false,
    },
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mapPath, outputPath] = process.argv.slice(2);
  if (!mapPath) {
    fail(
      "usage: node scripts/video-methodology-coverage.mjs docs/video-methodology-coverage-v5.json [coverage-report.json]",
    );
  }

  const map = JSON.parse(readFileSync(resolve(mapPath), "utf8"));
  const defaultE2EPath = resolve(
    "docs/video-studio-v5-e2e-plan.json",
  );
  const e2ePlan = existsSync(defaultE2EPath)
    ? JSON.parse(readFileSync(defaultE2EPath, "utf8"))
    : null;
  const report = auditMethodologyCoverage(map, { e2ePlan });

  if (outputPath) {
    writeFileSync(
      resolve(outputPath),
      JSON.stringify(report, null, 2) + "\n",
    );
  }

  process.stdout.write(
    JSON.stringify({
      ok: report.coverage_contract_pass,
      schema: report.schema,
      step_count: report.step_count,
      failed_steps: report.failed_steps,
      e2e_pending: report.summary.e2e_pending,
      e2e_validated: report.summary.e2e_validated,
      e2e_linkage_pass: report.e2e_linkage_pass,
      activation_policy_pass: report.activation_policy_pass,
      activated: report.summary.activated,
      publication_authorized: false,
    }) + "\n",
  );

  if (!report.coverage_contract_pass) process.exitCode = 2;
}
