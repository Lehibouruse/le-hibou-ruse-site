import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildResumePlan,
  RESUME_PLAN_SCHEMA,
} from "../scripts/video-resume-plan.mjs";

function write(root, rel, value = "x") {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
}

function actualLikeRoot({ badVoice = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hibou-resume-"));

  write(root, "storyboard.json", "{}");
  write(root, "voice/voice-master.wav", "wav");
  write(root, "voice/contract-audio-ready.json", "{}");
  write(root, "voice/voice-mastered.wav", "wav");
  write(root, "subtitles.ass", [
    "[V4+ Styles]",
    "Style: Narration,DejaVu Sans,54,&H00FFFFFF",
  ].join("\n"));
  write(root, "contract-captioned.json", "{}");
  write(root, "contract-styled.json", "{}");
  write(root, "contract-assets-resolved.json", "{}");
  write(root, "images/image-plan.json", "{}");
  write(root, "images/batch-manifest.json", "{}");
  write(root, "images/factory-run.json", "{}");
  write(root, "images/selections.json", "{}");
  write(root, "render-ready.json", "{}");
  mkdirSync(join(root, "voice", "voice-scenes"), { recursive: true });
  mkdirSync(join(root, ".video-render-cache"), { recursive: true });
  write(root, ".video-render-cache/scene-01-aaaaaaaaaaaaaaaa.mp4", "clip");
  write(root, ".video-render-cache/scene-02-bbbbbbbbbbbbbbbb.mp4", "clip");
  write(root, ".video-render-cache/visual-cccccccccccccccc.mp4", "visual");

  write(root, "voice/voice-batch-manifest.json", {
    schema: "HIBOU_CHATTERBOX_BATCH_V2",
    scenes: [{
      scene_id: "S13",
      text: "Le Hibou Rusé. Abonne-toi. Le guide est dans la bio.",
      voice_duration_s: badVoice ? 27.92 : 4.4,
      prosody_metadata_not_native: { target_wpm: 150 },
      cache: "miss",
    }],
  });

  return root;
}

function state() {
  return {
    schema: "HIBOU_VIDEO_MASTER_RUN_V1",
    stages: {
      storyboard: { status: "PASS" },
      voice: { status: "PASS" },
      audio_master: { status: "PASS" },
      subtitles: { status: "PASS" },
      style: { status: "PASS" },
      asset_resolution: { status: "PASS" },
      images: { status: "PASS" },
      technical_selection: { status: "PASS" },
      promotion: { status: "PASS" },
      render: {
        status: "ERROR",
        error: "ffmpeg failed: Fontconfig error: Cannot load default config file: File not found",
      },
    },
  };
}

function markVoiceQcsPassed(root,s){
  write(root, "voice/voice-duration-qc.json", {
    schema: "HIBOU_VOICE_DURATION_QC_V1",
    status: "PASS",
  });
  write(root, "voice/voice-silence-qc.json", {
    schema: "HIBOU_VOICE_SILENCE_QC_V1",
    status: "PASS",
  });
  s.stages.voice_duration_qc = { status: "PASS" };
  s.stages.voice_silence_qc = { status: "PASS" };
}


test("actual-like legacy run resumes from voice while preserving image caches", () => {
  const root = actualLikeRoot({ badVoice: true });
  try {
    const plan = buildResumePlan({
      root,
      state: state(),
      platform: "win32",
    });

    assert.equal(plan.schema, RESUME_PLAN_SCHEMA);
    assert.match(plan.source_state_sha256, /^[0-9a-f]{64}$/);
    assert.equal(plan.analysis_only, true);
    assert.equal(plan.execution_performed, false);
    assert.equal(plan.resume_stage, "voice");
    assert.equal(plan.failed_stages.includes("render"), true);
    assert.equal(
      plan.inferred_invalidations.some(
        (x) => x.code === "implausible_voice_duration_detected",
      ),
      true,
    );
    assert.equal(
      plan.inferred_invalidations.some(
        (x) => x.code === "windows_fontconfig_render_failure",
      ),
      true,
    );
    assert.equal(
      plan.required_runtime_capabilities.includes(
        "windows_private_fontconfig",
      ),
      true,
    );
    assert.equal(
      plan.preservable_artifacts.image_candidate_cache_should_be_preserved,
      true,
    );
    assert.equal(
      plan.preservable_artifacts.render_clip_cache_should_be_preserved,
      true,
    );
    assert.equal(plan.preservable_artifacts.render_scene_clip_count, 2);
    assert.equal(plan.preservable_artifacts.render_visual_count, 1);
    assert.equal(plan.preservable_artifacts.full_visual_cache_present, true);
    assert.equal(
      plan.preservable_artifacts.final_mux_may_reuse_visual_if_fingerprint_matches,
      true,
    );
    assert.equal(plan.files_deleted, false);
    assert.equal(plan.publication_authorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("good legacy voice requires the new duration QC before downstream reuse", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    const plan = buildResumePlan({
      root,
      state: state(),
      platform: "linux",
    });

    assert.equal(plan.resume_stage, "voice_duration_qc");
    assert.equal(
      plan.inferred_invalidations.some(
        (x) => x.code === "voice_duration_qc_missing_on_legacy_run",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("voice silence QC is the next conservative gate on legacy mastered audio", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    write(root, "voice/voice-duration-qc.json", {
      schema: "HIBOU_VOICE_DURATION_QC_V1",
      status: "PASS",
    });
    const s = state();
    s.stages.voice_duration_qc = { status: "PASS" };

    const plan = buildResumePlan({
      root,
      state: s,
      platform: "linux",
    });

    assert.equal(plan.resume_stage, "voice_silence_qc");
    assert.equal(
      plan.inferred_invalidations.some(
        (x) => x.code === "voice_silence_qc_missing_on_legacy_run",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("once voice duration QC is already passed, Windows Fontconfig failure resumes from subtitles", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    const s = state();
    markVoiceQcsPassed(root,s);

    const plan = buildResumePlan({
      root,
      state: s,
      platform: "win32",
    });

    assert.equal(plan.resume_stage, "subtitles");
    assert.equal(
      plan.inferred_invalidations.some(
        (x) => x.code === "windows_fontconfig_render_failure",
      ),
      true,
    );
    assert.equal(
      plan.inferred_invalidations.find(
        (x) => x.code === "windows_fontconfig_render_failure",
      ).subtitle_font_family,
      "DejaVu Sans",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PASS stage with missing artifact is invalidated instead of blindly reused", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    rmSync(join(root, "contract-styled.json"), { force: true });
    const s = state();
    markVoiceQcsPassed(root,s);
    s.stages.render = { status: "NOT_STARTED" };

    const plan = buildResumePlan({
      root,
      state: s,
      platform: "linux",
    });

    assert.equal(plan.resume_stage, "style");
    const issue = plan.inferred_invalidations.find(
      (x) => x.code === "pass_stage_artifact_missing",
    );
    assert.equal(issue.stage, "style");
    assert.deepEqual(issue.missing_artifacts, ["contract-styled.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit invalidation is conservative and preserves caches", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    const s = state();
    markVoiceQcsPassed(root,s);
    s.stages.render = { status: "PASS" };
    write(root, "master.mp4", "mp4");

    const plan = buildResumePlan({
      root,
      state: s,
      platform: "linux",
      invalidateStages: ["technical_selection"],
    });

    assert.equal(plan.resume_stage, "technical_selection");
    assert.equal(plan.stages_to_reset[0], "technical_selection");
    assert.equal(
      plan.preservable_artifacts.image_candidate_cache_should_be_preserved,
      true,
    );
    assert.equal(plan.processes_started, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clean state with no failure, running stage or invalidation does not invent a resume point", () => {
  const root = actualLikeRoot({ badVoice: false });
  try {
    write(root, "voice/voice-duration-qc.json", {
      schema: "HIBOU_VOICE_DURATION_QC_V1",
      status: "PASS",
    });
    write(root, "master.mp4", "mp4");
    const s = state();
    s.stages.voice_duration_qc = { status: "PASS" };
    s.stages.render = { status: "PASS" };

    const plan = buildResumePlan({
      root,
      state: s,
      platform: "linux",
    });

    assert.equal(plan.resume_required, false);
    assert.equal(plan.resume_stage, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
