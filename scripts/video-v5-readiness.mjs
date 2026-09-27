#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const READINESS_SCHEMA = "HIBOU_VIDEO_V5_READINESS_V1";

const FEATURE_GATES = [
  ["video_timeline_v1", "HIBOU_VIDEO_TIMELINE_V1"],
  ["video_creative_qc_v1", "HIBOU_VIDEO_CREATIVE_QC_V1"],
  ["video_pose_registry_v1", "HIBOU_VIDEO_POSE_REGISTRY_V1"],
  ["video_prosody_v1", "HIBOU_VIDEO_PROSODY_V1"],
  ["video_music_mix_v1", "HIBOU_VIDEO_MUSIC_V1"],
  ["video_incremental_retouch_v1", "HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1"],
];

function fail(message) {
  throw new Error(message);
}

function enabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function contractFeature(contract, name) {
  return contract?.features?.[name] === true;
}

function productionMode(contract) {
  const raw = String(contract?.production?.mode || "final").trim().toLowerCase();
  return raw;
}

function publicationSignals(contract) {
  return [
    contract?.publication_authorized,
    contract?.production?.publication_authorized,
    contract?.validation?.publication_authorized,
    contract?.delivery?.publication_authorized,
  ].filter((value) => value === true).length;
}

export function buildV5Readiness(contract, env = {}) {
  if (contract?.contract_version !== "HIBOU_VIDEO_CONTRACT_V1") {
    fail("HIBOU_VIDEO_CONTRACT_V1 required");
  }

  const mode = productionMode(contract);
  const blocking = [];
  const warnings = [];

  if (!["preview", "final"].includes(mode)) {
    blocking.push({
      code: "invalid_production_mode",
      detail: mode || null,
    });
  }

  if (publicationSignals(contract) > 0) {
    blocking.push({
      code: "publication_authorization_must_remain_false",
    });
  }

  if (
    mode === "preview"
    && contract?.production?.full_master_allowed === true
  ) {
    blocking.push({
      code: "preview_cannot_allow_full_master",
    });
  }

  const features = {};
  for (const [featureName, envName] of FEATURE_GATES) {
    const globalEnabled = contractFeature(contract, featureName);
    const runtimeEnabled = enabled(env[envName]);
    const active = globalEnabled && runtimeEnabled;

    features[featureName] = {
      global_enabled: globalEnabled,
      runtime_gate: envName,
      runtime_enabled: runtimeEnabled,
      active,
    };

    if (globalEnabled && !runtimeEnabled) {
      warnings.push({
        code: "global_enabled_runtime_disabled",
        feature: featureName,
        runtime_gate: envName,
      });
    } else if (!globalEnabled && runtimeEnabled) {
      warnings.push({
        code: "runtime_enabled_global_disabled",
        feature: featureName,
        runtime_gate: envName,
      });
    }
  }

  const remoteCancel = enabled(env.HIBOU_VIDEO_REMOTE_CANCEL_ENABLED);
  features.video_remote_cancel_v1 = {
    global_enabled: null,
    runtime_gate: "HIBOU_VIDEO_REMOTE_CANCEL_ENABLED",
    runtime_enabled: remoteCancel,
    active: remoteCancel,
  };

  if (
    features.video_music_mix_v1.active
    && !String(contract?.music?.reference || "").trim()
  ) {
    blocking.push({
      code: "music_reference_required_when_music_mix_active",
    });
  }

  const activeFeatures = Object.entries(features)
    .filter(([, value]) => value.active === true)
    .map(([name]) => name);

  return {
    schema: READINESS_SCHEMA,
    contract_version: contract.contract_version,
    contract_state: String(contract.contract_state || ""),
    content_id: String(contract?.content?.content_id || "") || null,
    production_mode: ["preview", "final"].includes(mode) ? mode : null,
    preview_only: mode === "preview",
    features,
    active_features: activeFeatures,
    warnings,
    blocking,
    ready_for_cpu_planning: blocking.length === 0,
    gpu_execution_performed: false,
    airtable_mutation_performed: false,
    human_review_required: true,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [contractPath, outputPath] = process.argv.slice(2);
  if (!contractPath) {
    fail("usage: node scripts/video-v5-readiness.mjs storyboard.json [output.json]");
  }
  const contract = JSON.parse(readFileSync(resolve(contractPath), "utf8"));
  const report = buildV5Readiness(contract, process.env);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (outputPath) writeFileSync(resolve(outputPath), json);
  process.stdout.write(json);
  if (!report.ready_for_cpu_planning) process.exitCode = 2;
}
