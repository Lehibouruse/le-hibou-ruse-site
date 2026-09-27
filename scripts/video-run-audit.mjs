#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditVoiceDurations } from "./video-voice-duration-qc.mjs";
import { buildResumePlan } from "./video-resume-plan.mjs";

export const RUN_AUDIT_SCHEMA = "HIBOU_VIDEO_RUN_AUDIT_V1";

function fail(message) {
  throw new Error(message);
}

function readJsonIf(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function listMatching(dir, pattern) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((name) => pattern.test(name));
  } catch {
    return [];
  }
}

function stageSummary(state) {
  const rows = Object.entries(state?.stages || {}).map(([stage, info]) => ({
    stage,
    status: String(info?.status || "UNKNOWN"),
    started_at: info?.started_at || null,
    finished_at: info?.finished_at || null,
    duration_ms:
      Number.isFinite(Number(info?.duration_ms))
        ? Number(info.duration_ms)
        : null,
    attempt:
      Number.isFinite(Number(info?.attempt))
        ? Number(info.attempt)
        : null,
    error:
      info?.status === "ERROR"
        ? String(info?.error || "").slice(-3000) || null
        : null,
  }));

  return {
    rows,
    passed: rows.filter((row) => row.status === "PASS").map((row) => row.stage),
    running: rows.filter((row) => row.status === "RUNNING").map((row) => row.stage),
    failed: rows.filter((row) => row.status === "ERROR").map((row) => row.stage),
    skipped: rows.filter((row) => row.status === "SKIPPED").map((row) => row.stage),
  };
}

function voiceSummary(root) {
  const manifest = readJsonIf(join(root, "voice", "voice-batch-manifest.json"));
  if (!manifest) {
    return {
      available: false,
      scene_count: 0,
      total_voice_duration_s: null,
      duration_qc: null,
    };
  }

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const total = scenes.reduce(
    (sum, scene) => sum + Math.max(0, Number(scene?.voice_duration_s || 0)),
    0,
  );

  let qc = null;
  try {
    const report = auditVoiceDurations(manifest);
    qc = {
      schema: report.schema,
      status: report.status,
      rejected_scene_count: report.rejected_scene_count,
      rejected_scene_ids: report.rejected_scene_ids,
      rejected_scenes: report.scenes
        .filter((row) => row.status === "REJECT")
        .map((row) => ({
          scene_id: row.scene_id,
          actual_duration_s: row.actual_duration_s,
          expected_duration_s: row.expected_duration_s,
          actual_to_expected_ratio: row.actual_to_expected_ratio,
          reasons: row.reasons,
        })),
    };
  } catch (error) {
    qc = {
      status: "UNAVAILABLE",
      error: String(error?.message || error),
    };
  }

  return {
    available: true,
    schema: manifest.schema || null,
    scene_count: scenes.length,
    total_voice_duration_s: Math.round(total * 1000) / 1000,
    cache_hits: Number(manifest.cache_hits || 0),
    cache_misses: Number(manifest.cache_misses || 0),
    duration_qc: qc,
  };
}

function imageSummary(root) {
  const images = join(root, "images");
  const plan = readJsonIf(join(images, "image-plan.json"));
  const batch = readJsonIf(join(images, "batch-manifest.json"));
  const factory = readJsonIf(join(images, "factory-run.json"));
  const review = readJsonIf(join(images, "candidate-review.json"));
  const selections =
    readJsonIf(join(images, "selections.json")) ||
    readJsonIf(join(images, "selections.provisional.json"));

  const results = Object.values(batch?.results || {});
  const completed = results.filter((row) => row?.status === "completed").length;
  const failed = results.filter((row) => row?.status === "error").length;
  const sceneIds = new Set(
    results
      .filter((row) => row?.status === "completed")
      .map((row) => String(row?.scene_id || ""))
      .filter(Boolean),
  );

  const reviewScenes = Array.isArray(review?.scenes) ? review.scenes : [];
  const ambiguous = reviewScenes.filter(
    (scene) => scene?.machine_recommendation_status === "AMBIGUOUS",
  );

  return {
    available: Boolean(plan || batch || factory),
    planned_candidate_count:
      Number(plan?.request_count || plan?.requests?.length || 0) || null,
    completed_candidate_count: completed,
    failed_candidate_count: failed,
    completed_scene_count: sceneIds.size,
    selected_scene_count: selections
      ? Object.keys(selections).length
      : 0,
    factory_all_scenes_have_candidate:
      factory?.all_scenes_have_candidate ?? null,
    candidate_review_available: Boolean(review),
    candidate_review_blocking_scene_count:
      Number(review?.blocking_scene_count || 0),
    candidate_review_ambiguous_scene_count: ambiguous.length,
    candidate_review_ambiguous_scene_ids: ambiguous.map((scene) =>
      String(scene?.scene_id || ""),
    ),
    timing: factory?.timing || batch?.run_timing || null,
  };
}

function renderSummary(root) {
  const cache = join(root, ".video-render-cache");
  const sceneClips = listMatching(
    cache,
    /^scene-\d{2}-[0-9a-f]+\.mp4$/i,
  );
  const visuals = listMatching(cache, /^visual-[0-9a-f]+\.mp4$/i);
  const master = join(root, "master.mp4");
  const masterExists = existsSync(master);

  return {
    cache_available: existsSync(cache),
    scene_clip_count: sceneClips.length,
    full_visual_count: visuals.length,
    full_visual_ready: visuals.length > 0,
    master_exists: masterExists,
    master_bytes: masterExists ? statSync(master).size : 0,
  };
}

export function auditVideoRun(rootArg, { platform = process.platform } = {}) {
  if (!String(rootArg || "").trim()) fail("render root required");
  const root = resolve(rootArg);
  const statePath = join(root, "pipeline-run.json");
  if (!existsSync(statePath)) fail("pipeline-run.json missing");

  const state = readJsonIf(statePath);
  if (state?.schema !== "HIBOU_VIDEO_MASTER_RUN_V1") {
    fail("HIBOU_VIDEO_MASTER_RUN_V1 required");
  }

  const stages = stageSummary(state);
  const voice = voiceSummary(root);
  const images = imageSummary(root);
  const render = renderSummary(root);

  let resume = null;
  try {
    const plan = buildResumePlan({
      root,
      state,
      platform,
    });
    resume = {
      schema: plan.schema,
      resume_required: plan.resume_required,
      resume_stage: plan.resume_stage,
      failed_stages: plan.failed_stages,
      inferred_invalidations: plan.inferred_invalidations,
      stages_to_reset: plan.stages_to_reset,
      preservable_artifacts: plan.preservable_artifacts,
      required_runtime_capabilities: plan.required_runtime_capabilities,
      source_state_sha256: plan.source_state_sha256,
      execution_performed: false,
    };
  } catch (error) {
    resume = {
      status: "UNAVAILABLE",
      error: String(error?.message || error),
      execution_performed: false,
    };
  }

  const attention = [];
  if (stages.failed.length) {
    attention.push({
      code: "pipeline_stage_error",
      stages: stages.failed,
    });
  }
  if (stages.running.length) {
    attention.push({
      code: "pipeline_stage_still_running",
      stages: stages.running,
    });
  }
  if (voice.duration_qc?.status === "REJECT") {
    attention.push({
      code: "voice_duration_anomaly",
      scene_ids: voice.duration_qc.rejected_scene_ids,
    });
  }
  if (images.failed_candidate_count > 0) {
    attention.push({
      code: "image_candidate_failures",
      count: images.failed_candidate_count,
    });
  }
  if (images.candidate_review_ambiguous_scene_count > 0) {
    attention.push({
      code: "image_ranking_ambiguous",
      scene_ids: images.candidate_review_ambiguous_scene_ids,
    });
  }

  return {
    schema: RUN_AUDIT_SCHEMA,
    root,
    audited_at: new Date().toISOString(),
    analysis_only: true,
    filesystem_mutation_performed: false,
    process_started: false,
    platform,
    pipeline: {
      schema: state.schema,
      pipeline_status: state.pipeline_status || null,
      stages,
      stage_history_count: Array.isArray(state.stage_history)
        ? state.stage_history.length
        : 0,
    },
    voice,
    images,
    render,
    resume,
    attention_required: attention.length > 0,
    attention,
    policy: {
      read_only_by_design: true,
      audit_never_resets_state: true,
      audit_never_starts_resume: true,
      audit_never_deletes_artifacts: true,
      human_review_required: true,
      publication_authorized: false,
    },
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [rootArg, ...rest] = process.argv.slice(2);
  let platform = process.platform;
  for (const arg of rest) {
    if (arg.startsWith("--platform=")) {
      platform = String(arg.slice("--platform=".length)).trim();
    }
  }
  const audit = auditVideoRun(rootArg, { platform });
  process.stdout.write(JSON.stringify(audit, null, 2) + "\n");
}
