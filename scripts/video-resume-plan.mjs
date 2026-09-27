#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditVoiceDurations } from "./video-voice-duration-qc.mjs";

export const RESUME_PLAN_SCHEMA = "HIBOU_VIDEO_RESUME_PLAN_V1";

const STAGE_ORDER = [
  "storyboard",
  "prosody",
  "voice",
  "voice_duration_qc",
  "audio_master",
  "music_mix",
  "audio_attach",
  "subtitles",
  "style",
  "pose_registry",
  "asset_resolution",
  "images",
  "technical_selection",
  "creative_qc",
  "promotion",
  "render",
  "master_qc",
  "review_diff",
  "human_review_manifest",
  "registry",
  "durable_storage_plan",
  "airtable_report",
];

const ARTIFACTS = {
  storyboard: ["storyboard.json"],
  prosody: ["storyboard-prosody.json"],
  voice: [
    "voice/voice-batch-manifest.json",
    "voice/voice-master.wav",
    "voice/contract-audio-ready.json",
  ],
  voice_duration_qc: ["voice/voice-duration-qc.json"],
  audio_master: ["voice/voice-mastered.wav"],
  music_mix: ["voice/voice-music-mixed.wav"],
  audio_attach: ["contract-mastered.json"],
  subtitles: ["subtitles.ass", "contract-captioned.json"],
  style: ["contract-styled.json"],
  pose_registry: ["contract-posed.json"],
  asset_resolution: ["contract-assets-resolved.json"],
  images: [
    "images/batch-manifest.json",
    "images/factory-run.json",
    "images/image-plan.json",
  ],
  technical_selection: ["images/selections.json"],
  creative_qc: ["creative-qc.json"],
  promotion: ["render-ready.json"],
  render: ["master.mp4"],
  master_qc: ["master-qc.json"],
  review_diff: ["review-diff.json"],
  human_review_manifest: ["human-review.json"],
  registry: ["artifact-registry.json"],
  durable_storage_plan: ["durable-storage-plan.json"],
};

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stageStatus(state, name) {
  return String(state?.stages?.[name]?.status || "NOT_STARTED").toUpperCase();
}

function artifactStatus(root, stage) {
  const required = ARTIFACTS[stage] || [];
  const present = required.filter((rel) => existsSync(join(root, rel)));
  const missing = required.filter((rel) => !existsSync(join(root, rel)));
  return {
    required,
    present,
    missing,
    complete: required.length === 0 ? null : missing.length === 0,
  };
}

function downstreamFrom(stage) {
  const index = STAGE_ORDER.indexOf(stage);
  return index < 0 ? [] : STAGE_ORDER.slice(index);
}

function parseSubtitleFont(root) {
  const assPath = join(root, "subtitles.ass");
  if (!existsSync(assPath)) return null;
  try {
    const ass = readFileSync(assPath, "utf8");
    const match = ass.match(/^Style:\s*Narration,([^,]+),/m);
    return match ? String(match[1]).trim() : null;
  } catch {
    return null;
  }
}

function inferVoiceInvalidation(root, state) {
  const voiceManifestPath = join(root, "voice", "voice-batch-manifest.json");
  if (!existsSync(voiceManifestPath)) return null;

  let manifest;
  try {
    manifest = readJson(voiceManifestPath);
  } catch (error) {
    return {
      stage: "voice",
      code: "voice_manifest_unreadable",
      detail: String(error?.message || error),
    };
  }

  try {
    const report = auditVoiceDurations(manifest);
    if (report.status === "REJECT") {
      return {
        stage: "voice",
        code: "implausible_voice_duration_detected",
        rejected_scene_ids: report.rejected_scene_ids,
        rejected_scene_count: report.rejected_scene_count,
        evidence_schema: report.schema,
      };
    }

    if (
      stageStatus(state, "voice") === "PASS" &&
      stageStatus(state, "voice_duration_qc") === "NOT_STARTED"
    ) {
      return {
        stage: "voice_duration_qc",
        code: "voice_duration_qc_missing_on_legacy_run",
        rejected_scene_ids: [],
        evidence_schema: report.schema,
      };
    }
  } catch (error) {
    return {
      stage: "voice_duration_qc",
      code: "voice_duration_audit_unavailable",
      detail: String(error?.message || error),
    };
  }

  return null;
}

function inferRenderInvalidation(root, state, platform) {
  const render = state?.stages?.render || {};
  const error = String(render.error || "");
  if (
    platform === "win32" &&
    /Fontconfig error:\s*Cannot load default config file/i.test(error)
  ) {
    return {
      stage: "subtitles",
      code: "windows_fontconfig_render_failure",
      subtitle_font_family: parseSubtitleFont(root),
      required_runtime_capabilities: [
        "windows_private_fontconfig",
        "windows_fontsdir_binding",
        "windows_native_subtitle_font",
      ],
    };
  }
  if (stageStatus(state, "render") === "ERROR") {
    return {
      stage: "render",
      code: "render_stage_failed",
      detail: error.slice(-2000) || null,
    };
  }
  return null;
}

function explicitInvalidations(values) {
  const out = [];
  for (const raw of values || []) {
    const stage = String(raw || "").trim();
    if (!stage) continue;
    if (!STAGE_ORDER.includes(stage)) {
      fail("unknown invalidation stage: " + stage);
    }
    out.push({
      stage,
      code: "explicit_invalidation",
    });
  }
  return out;
}

export function buildResumePlan({
  root,
  state,
  platform = process.platform,
  invalidateStages = [],
} = {}) {
  const resolvedRoot = resolve(String(root || ""));
  if (!resolvedRoot) fail("render root required");
  if (state?.schema !== "HIBOU_VIDEO_MASTER_RUN_V1") {
    fail("HIBOU_VIDEO_MASTER_RUN_V1 required");
  }

  const diagnostics = [];
  const voice = inferVoiceInvalidation(resolvedRoot, state);
  if (voice) diagnostics.push(voice);
  const render = inferRenderInvalidation(resolvedRoot, state, platform);
  if (render) diagnostics.push(render);
  diagnostics.push(...explicitInvalidations(invalidateStages));

  const invalidationStages = unique(diagnostics.map((item) => item.stage));
  const invalidationIndexes = invalidationStages
    .map((stage) => STAGE_ORDER.indexOf(stage))
    .filter((index) => index >= 0);
  const earliestIndex = invalidationIndexes.length
    ? Math.min(...invalidationIndexes)
    : -1;

  const failedStages = STAGE_ORDER.filter(
    (stage) => stageStatus(state, stage) === "ERROR",
  );
  const firstFailedIndex = failedStages.length
    ? Math.min(...failedStages.map((stage) => STAGE_ORDER.indexOf(stage)))
    : -1;

  let resumeIndex = earliestIndex;
  if (resumeIndex < 0 && firstFailedIndex >= 0) resumeIndex = firstFailedIndex;

  if (resumeIndex < 0) {
    const firstIncomplete = STAGE_ORDER.findIndex((stage) =>
      ["NOT_STARTED", "RUNNING"].includes(stageStatus(state, stage)),
    );
    if (firstIncomplete >= 0) resumeIndex = firstIncomplete;
  }

  const resumeStage = resumeIndex >= 0 ? STAGE_ORDER[resumeIndex] : null;
  const stagesToReset = resumeStage ? downstreamFrom(resumeStage) : [];

  const stageRows = STAGE_ORDER.map((stage, index) => {
    const status = stageStatus(state, stage);
    const artifacts = artifactStatus(resolvedRoot, stage);
    const shouldReset = resumeIndex >= 0 && index >= resumeIndex;
    const wasPass = status === "PASS";
    return {
      stage,
      previous_status: status,
      artifact_status: artifacts,
      action: shouldReset
        ? "RERUN_OR_REVALIDATE"
        : wasPass
          ? "REUSE_STAGE_RESULT"
          : status === "SKIPPED"
            ? "KEEP_SKIPPED"
            : "NOT_REQUIRED_BEFORE_RESUME_POINT",
      previous_pass_is_not_automatic_approval: true,
    };
  });

  const imageArtifactsPresent =
    existsSync(join(resolvedRoot, "images", "batch-manifest.json")) &&
    existsSync(join(resolvedRoot, "images", "image-plan.json"));
  const voiceCachePresent =
    existsSync(join(resolvedRoot, "voice", "voice-scenes")) ||
    existsSync(join(resolvedRoot, "voice", "voice-batch-manifest.json"));
  const renderCachePresent = existsSync(
    join(resolvedRoot, ".video-render-cache"),
  );

  const requiredCapabilities = unique(
    diagnostics.flatMap((item) => item.required_runtime_capabilities || []),
  );

  return {
    schema: RESUME_PLAN_SCHEMA,
    root: resolvedRoot,
    source_state_schema: state.schema,
    analysis_only: true,
    execution_performed: false,
    files_deleted: false,
    files_moved: false,
    processes_started: false,
    platform,
    resume_required: Boolean(resumeStage),
    resume_stage: resumeStage,
    diagnostics,
    failed_stages: failedStages,
    requested_invalidations: unique(invalidateStages),
    inferred_invalidations: diagnostics.filter(
      (item) => item.code !== "explicit_invalidation",
    ),
    stages_to_reset: stagesToReset,
    stage_plan: stageRows,
    preservable_artifacts: {
      image_candidate_cache_present: imageArtifactsPresent,
      image_candidate_cache_should_be_preserved: imageArtifactsPresent,
      voice_scene_cache_present: voiceCachePresent,
      voice_scene_cache_should_be_preserved: voiceCachePresent,
      voice_scene_cache_must_self_validate_duration: true,
      render_clip_cache_present: renderCachePresent,
      render_clip_cache_should_be_preserved: renderCachePresent,
      stale_cache_entries_should_not_be_deleted: true,
      cache_fingerprints_decide_reuse_after_rerun: true,
    },
    required_runtime_capabilities: requiredCapabilities,
    policy: {
      plan_does_not_mutate_pipeline_state: true,
      pass_status_does_not_override_new_invalidation: true,
      preserve_caches_and_revalidate_by_fingerprint: true,
      rerun_is_conservative_from_earliest_invalidation: true,
      human_review_required: true,
      publication_authorized: false,
    },
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [rootArg, outputArg, ...rest] = process.argv.slice(2);
  if (!rootArg) {
    fail(
      "usage: node scripts/video-resume-plan.mjs <render-root> [output.json] [--invalidate=stage1,stage2] [--platform=win32]",
    );
  }

  const root = resolve(rootArg);
  const statePath = join(root, "pipeline-run.json");
  if (!existsSync(statePath)) fail("pipeline-run.json missing");

  let platform = process.platform;
  let invalidateStages = [];
  for (const arg of rest) {
    if (arg.startsWith("--platform=")) {
      platform = String(arg.slice("--platform=".length)).trim();
    } else if (arg.startsWith("--invalidate=")) {
      invalidateStages = arg
        .slice("--invalidate=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  const plan = buildResumePlan({
    root,
    state: readJson(statePath),
    platform,
    invalidateStages,
  });

  if (outputArg && !String(outputArg).startsWith("--")) {
    writeFileSync(resolve(outputArg), JSON.stringify(plan, null, 2) + "\n");
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: plan.schema,
      resume_required: plan.resume_required,
      resume_stage: plan.resume_stage,
      failed_stages: plan.failed_stages,
      inferred_invalidations: plan.inferred_invalidations.map((x) => x.code),
      execution_performed: false,
      publication_authorized: false,
    }) + "\n",
  );
}
