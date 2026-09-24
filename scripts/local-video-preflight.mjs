#!/usr/bin/env node
// Compatibility alias. Canonical implementation: scripts/video-local-preflight.mjs
import { collectPreflight } from "./video-local-preflight.mjs";

const report = collectPreflight();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--require-gpu") && !report.decision.ready_for_model_smoke_test) process.exitCode = 2;
