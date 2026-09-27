import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  auditVideoRun,
  RUN_AUDIT_SCHEMA,
} from "../scripts/video-run-audit.mjs";

function write(root, rel, value) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hibou-run-audit-"));
  const stages = {
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
      error:
        "ffmpeg failed: Fontconfig error: Cannot load default config file: File not found",
    },
  };
  write(root, "pipeline-run.json", {
    schema: "HIBOU_VIDEO_MASTER_RUN_V1",
    pipeline_status: "ERROR",
    stages,
  });

  write(root, "storyboard.json", {
    scenes: Array.from({ length: 13 }, (_, index) => ({
      scene_id: `S${String(index + 1).padStart(2, "0")}`,
    })),
  });

  const voiceScenes = Array.from({ length: 13 }, (_, index) => ({
    scene_id: `S${String(index + 1).padStart(2, "0")}`,
    text:
      index === 12
        ? "Le Hibou Rusé. Abonne-toi. Le guide est dans la bio."
        : "Une phrase suffisamment normale pour cette scène.",
    voice_duration_s: index === 12 ? 27.92 : 4.5,
    prosody_metadata_not_native: { target_wpm: 150 },
    cache: "miss",
  }));
  write(root, "voice/voice-batch-manifest.json", {
    schema: "HIBOU_CHATTERBOX_BATCH_V3",
    cache_hits: 0,
    cache_misses: 13,
    scenes: voiceScenes,
  });
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
  write(root, "render-ready.json", "{}");

  const requests = Array.from({ length: 26 }, (_, index) => ({
    candidate_id: `C${index + 1}`,
    scene_id: `S${String(Math.floor(index / 2) + 1).padStart(2, "0")}`,
  }));
  write(root, "images/image-plan.json", {
    schema: "HIBOU_IMAGE_PLAN_V1",
    request_count: 26,
    requests,
  });
  write(
    root,
    "images/batch-manifest.json",
    {
      results: Object.fromEntries(
        requests.map((request) => [
          request.candidate_id,
          {
            ...request,
            status: "completed",
          },
        ]),
      ),
    },
  );
  write(root, "images/factory-run.json", {
    schema: "HIBOU_IMAGE_FACTORY_RUN_V1",
    all_scenes_have_candidate: true,
  });
  write(
    root,
    "images/selections.json",
    Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [
        `S${String(index + 1).padStart(2, "0")}`,
        { selected: `scene-${index + 1}.png` },
      ]),
    ),
  );
  write(root, "images/candidate-review.json", {
    schema: "HIBOU_CANDIDATE_REVIEW_V1",
    blocking_scene_count: 0,
    scenes: [
      {
        scene_id: "S01",
        machine_recommendation_status: "AMBIGUOUS",
      },
    ],
  });

  mkdirSync(join(root, ".video-render-cache"), { recursive: true });
  for (let index = 1; index <= 13; index += 1) {
    write(
      root,
      `.video-render-cache/scene-${String(index).padStart(2, "0")}-aaaaaaaaaaaaaaaa.mp4`,
      "clip",
    );
  }
  write(
    root,
    ".video-render-cache/visual-bbbbbbbbbbbbbbbb.mp4",
    "visual",
  );

  return root;
}

test("run audit consolidates real-like voice image render and resume diagnostics", () => {
  const root = fixture();
  try {
    const audit = auditVideoRun(root, { platform: "win32" });

    assert.equal(audit.schema, RUN_AUDIT_SCHEMA);
    assert.equal(audit.analysis_only, true);
    assert.equal(audit.filesystem_mutation_performed, false);
    assert.equal(audit.process_started, false);
    assert.deepEqual(audit.pipeline.stages.failed, ["render"]);

    assert.equal(audit.voice.scene_count, 13);
    assert.equal(audit.voice.duration_qc.status, "REJECT");
    assert.deepEqual(audit.voice.duration_qc.rejected_scene_ids, ["S13"]);

    assert.equal(audit.images.planned_candidate_count, 26);
    assert.equal(audit.images.completed_candidate_count, 26);
    assert.equal(audit.images.completed_scene_count, 13);
    assert.equal(audit.images.selected_scene_count, 13);
    assert.equal(audit.images.candidate_review_ambiguous_scene_count, 1);

    assert.equal(audit.render.scene_clip_count, 13);
    assert.equal(audit.render.full_visual_count, 1);
    assert.equal(audit.render.full_visual_ready, true);
    assert.equal(audit.render.master_exists, false);

    assert.equal(audit.resume.resume_required, true);
    assert.equal(audit.resume.resume_stage, "voice");
    assert.equal(
      audit.resume.required_runtime_capabilities.includes(
        "windows_private_fontconfig",
      ),
      true,
    );

    const codes = audit.attention.map((item) => item.code);
    assert.equal(codes.includes("pipeline_stage_error"), true);
    assert.equal(codes.includes("voice_duration_anomaly"), true);
    assert.equal(codes.includes("image_ranking_ambiguous"), true);
    assert.equal(audit.publication_authorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run audit is quiet on a clean completed run", () => {
  const root = fixture();
  try {
    const statePath = join(root, "pipeline-run.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.stages.render = { status: "PASS" };
    state.stages.voice_duration_qc = { status: "PASS" };
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const voicePath = join(root, "voice", "voice-batch-manifest.json");
    const voice = JSON.parse(readFileSync(voicePath, "utf8"));
    voice.scenes[12].voice_duration_s = 4.5;
    writeFileSync(voicePath, JSON.stringify(voice, null, 2));
    write(root, "voice/voice-duration-qc.json", {
      schema: "HIBOU_VOICE_DURATION_QC_V1",
      status: "PASS",
    });
    write(root, "master.mp4", "master");

    const reviewPath = join(root, "images", "candidate-review.json");
    const review = JSON.parse(readFileSync(reviewPath, "utf8"));
    review.scenes = [];
    writeFileSync(reviewPath, JSON.stringify(review, null, 2));

    const audit = auditVideoRun(root, { platform: "linux" });
    assert.equal(audit.voice.duration_qc.status, "PASS");
    assert.equal(audit.render.master_exists, true);
    assert.equal(audit.images.candidate_review_ambiguous_scene_count, 0);
    assert.equal(
      audit.attention.some((item) => item.code === "voice_duration_anomaly"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run audit rejects missing pipeline state", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-run-audit-empty-"));
  try {
    assert.throws(
      () => auditVideoRun(root),
      /pipeline-run\.json missing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("run audit identifies a prepared repair waiting for separate explicit start", () => {
  const root = fixture();
  try {
    const statePath = join(root, "pipeline-run.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.pipeline_status = "RESUME_PREPARED";
    state.resume_prepared = {
      resume_stage: "render",
      reset_stages: ["render", "master_qc"],
      execution_started: false,
      publication_authorized: false,
    };
    delete state.stages.render;
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    write(root, "_hibou_video_resume_apply_receipt.json", {
      schema: "HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1",
      plan_sha256: "a".repeat(64),
      reset_stages: ["render", "master_qc"],
      execution_started: false,
      publication_authorized: false,
    });
    write(root, "_hibou_video_remote_repair_prepared.json", {
      schema: "HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1",
      resume_stage: "render",
      reset_stages: ["render", "master_qc"],
      requires_separate_render_start: true,
      execution_started: false,
      publication_authorized: false,
    });

    const audit = auditVideoRun(root, { platform: "win32" });
    assert.equal(audit.resume_preparation.prepared, true);
    assert.equal(audit.resume_preparation.resume_stage, "render");
    assert.equal(audit.resume_preparation.receipt_available, true);
    assert.equal(audit.resume_preparation.remote_marker_available, true);
    assert.equal(
      audit.resume_preparation.remote_marker_schema,
      "HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1",
    );
    assert.equal(
      audit.resume_preparation.requires_separate_render_start,
      true,
    );
    assert.equal(audit.resume_preparation.execution_started, false);
    assert.equal(
      audit.attention.some(
        (item) => item.code === "resume_prepared_waiting_explicit_start",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
