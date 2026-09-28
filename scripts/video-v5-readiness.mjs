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
  ["video_human_candidate_selection_v1", "HIBOU_VIDEO_HUMAN_SELECTION_V1"],
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

const CANONICAL_BRANDING = Object.freeze({
  text: "Le Hibou Rusé",
  position: "bottom-center",
  size: "small",
  color: "ink",
  source: "post-production",
});

function finiteRange(value) {
  return (
    Array.isArray(value)
    && value.length === 2
    && value.every((item) => Number.isFinite(Number(item)))
    && Number(value[0]) <= Number(value[1])
  );
}

function canonicalInvariantChecks(contract) {
  const blocking = [];
  const warnings = [];
  const creative = contract?.creative || {};
  const branding = creative?.branding || {};
  const scenes = Array.isArray(contract?.scenes) ? contract.scenes : [];

  if (String(creative.profile_name || "") !== "HIBOU_VIRAL_V1") {
    blocking.push({ code: "canonical_profile_required" });
  }
  if (String(creative.reference_mode || "") !== "deterministic_character_overlay") {
    blocking.push({ code: "deterministic_character_overlay_required" });
  }
  if (!String(creative.reference_asset_repo_path || "").trim()) {
    blocking.push({ code: "canonical_character_asset_required" });
  }
  if (String(creative.language || "").trim().toLowerCase() !== "fr") {
    blocking.push({ code: "french_language_lock_required" });
  }
  if (creative.text_in_generated_images !== false) {
    blocking.push({ code: "generated_image_text_must_be_disabled" });
  }

  for (const [field, expected] of Object.entries(CANONICAL_BRANDING)) {
    if (String(branding?.[field] || "") !== expected) {
      blocking.push({
        code: "canonical_branding_mismatch",
        field,
        expected,
        actual: branding?.[field] ?? null,
      });
    }
  }

  for (const field of ["style_lock", "negative_prompt", "character_lock"]) {
    if (!String(creative?.[field] || "").trim()) {
      blocking.push({ code: "creative_lock_missing", field });
    }
  }

  if (contract?.validation?.human_required !== true) {
    blocking.push({ code: "human_review_must_be_required" });
  }

  const width = Number(contract?.engine?.width);
  const height = Number(contract?.engine?.height);
  const fps = Number(contract?.engine?.fps);
  if (width !== 1080 || height !== 1920 || fps !== 30) {
    blocking.push({
      code: "mobile_render_geometry_mismatch",
      expected: { width: 1080, height: 1920, fps: 30 },
      actual: { width, height, fps },
    });
  }

  if (scenes.length < 8 || scenes.length > 18) {
    blocking.push({
      code: "scene_count_outside_contract_bounds",
      scene_count: scenes.length,
      allowed: [8, 18],
    });
  }

  const seenSceneIds = new Set();
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index] || {};
    const id = String(scene.scene_id || "").trim();
    if (!id || seenSceneIds.has(id)) {
      blocking.push({
        code: "scene_id_missing_or_duplicate",
        scene_index: index,
        scene_id: id || null,
      });
    } else {
      seenSceneIds.add(id);
    }

    if (Number(scene.order) !== index + 1) {
      blocking.push({
        code: "scene_order_not_contiguous",
        scene_id: id || null,
        expected_order: index + 1,
        actual_order: Number(scene.order),
      });
    }

    const duration = Number(scene.planned_duration_s);
    if (!Number.isFinite(duration) || duration < 1.5 || duration > 12) {
      blocking.push({
        code: "scene_duration_outside_allowed_bounds",
        scene_id: id || null,
        duration_s: Number.isFinite(duration) ? duration : null,
      });
    }
  }

  const pacing = creative?.pacing || {};
  if (!finiteRange(pacing.perceptible_beat_s)) {
    blocking.push({ code: "perceptible_beat_range_invalid" });
  }
  if (!finiteRange(pacing.full_composition_change_s)) {
    blocking.push({ code: "full_composition_change_range_invalid" });
  }
  if (
    finiteRange(pacing.perceptible_beat_s)
    && finiteRange(pacing.full_composition_change_s)
    && Number(pacing.full_composition_change_s[0])
      < Number(pacing.perceptible_beat_s[0])
  ) {
    blocking.push({
      code: "full_composition_changes_cannot_be_faster_than_attention_beats",
    });
  }

  const defaults = creative?.production_defaults || {};
  const plansMin = Number(defaults.plans_min);
  const plansMax = Number(defaults.plans_max);
  if (
    !Number.isFinite(plansMin)
    || !Number.isFinite(plansMax)
    || plansMin < 1
    || plansMin > plansMax
    || plansMax > 25
  ) {
    blocking.push({ code: "production_plan_bounds_invalid" });
  } else if (scenes.length < plansMin || scenes.length > plansMax) {
    warnings.push({
      code: "scene_count_outside_profile_target",
      scene_count: scenes.length,
      target: [plansMin, plansMax],
    });
  }

  const zoomMin = Number(defaults.zoom_min_pct);
  const zoomMax = Number(defaults.zoom_max_pct);
  if (
    !Number.isFinite(zoomMin)
    || !Number.isFinite(zoomMax)
    || zoomMin < 0
    || zoomMin > zoomMax
    || zoomMax > 5
  ) {
    blocking.push({ code: "zoom_policy_invalid" });
  }

  const method = String(contract?.content?.method_version || "").trim();
  if (method && method !== "VIDEO_METHOD_V4.3") {
    warnings.push({
      code: "unexpected_method_version",
      method_version: method,
      expected: "VIDEO_METHOD_V4.3",
    });
  }

  return { blocking, warnings };
}

export function buildV5Readiness(contract, env = {}) {
  if (contract?.contract_version !== "HIBOU_VIDEO_CONTRACT_V1") {
    fail("HIBOU_VIDEO_CONTRACT_V1 required");
  }

  const mode = productionMode(contract);
  const invariants = canonicalInvariantChecks(contract);
  const blocking = [...invariants.blocking];
  const warnings = [...invariants.warnings];

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
    canonical_invariants: {
      profile: "HIBOU_VIRAL_V1",
      branding: CANONICAL_BRANDING,
      scene_bounds: [8, 18],
      render_geometry: { width: 1080, height: 1920, fps: 30 },
    },
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
