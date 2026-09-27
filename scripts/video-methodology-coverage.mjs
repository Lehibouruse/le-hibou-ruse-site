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

export function auditMethodologyCoverage(map) {
  if (map?.schema !== "HIBOU_VIDEO_METHODOLOGY_COVERAGE_V1") {
    fail("HIBOU_VIDEO_METHODOLOGY_COVERAGE_V1 required");
  }

  const seen = new Set();
  const steps = [];
  let missingFileCount = 0;
  let missingMarkerCount = 0;

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

    steps.push({
      id,
      label: String(step?.label || ""),
      static_coverage_pass: staticCoveragePass,
      code: codeChecks,
      tests: testChecks,
      e2e_pending: step?.e2e_pending === true,
      activation_policy: step?.activation_policy || null,
      active: false,
    });
  }

  const failedSteps = steps
    .filter((step) => !step.static_coverage_pass)
    .map((step) => step.id);

  return {
    schema: METHODOLOGY_COVERAGE_SCHEMA,
    method_version: map.method_version || null,
    source: map.source || null,
    step_count: steps.length,
    static_coverage_pass: failedSteps.length === 0,
    failed_steps: failedSteps,
    missing_file_count: missingFileCount,
    missing_marker_count: missingMarkerCount,
    steps,
    summary: {
      coded_and_statically_covered:
        steps.filter((step) => step.static_coverage_pass).length,
      e2e_pending:
        steps.filter((step) => step.e2e_pending).length,
      activated: 0,
    },
    policy: {
      static_coverage_does_not_equal_e2e_validation: true,
      e2e_validation_does_not_equal_activation: true,
      activation_remains_explicit: true,
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
  const report = auditMethodologyCoverage(map);

  if (outputPath) {
    writeFileSync(
      resolve(outputPath),
      JSON.stringify(report, null, 2) + "\n",
    );
  }

  process.stdout.write(
    JSON.stringify({
      ok: report.static_coverage_pass,
      schema: report.schema,
      step_count: report.step_count,
      failed_steps: report.failed_steps,
      e2e_pending: report.summary.e2e_pending,
      activated: 0,
      publication_authorized: false,
    }) + "\n",
  );

  if (!report.static_coverage_pass) process.exitCode = 2;
}
