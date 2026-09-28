import assert from "node:assert/strict";
import test from "node:test";
import {
  buildV5Readiness,
  READINESS_SCHEMA,
} from "../scripts/video-v5-readiness.mjs";

function contract() {
  return {
    contract_version: "HIBOU_VIDEO_CONTRACT_V1",
    contract_state: "storyboard",
    content: {
      content_id: "recCONTENT1234567",
      method_version: "VIDEO_METHOD_V4.3",
    },
    creative: {
      profile_name: "HIBOU_VIRAL_V1",
      style_lock: "adult editorial 2D style lock",
      negative_prompt: "no humans, no text, no identity drift",
      character_lock: "canonical monocle owl identity lock",
      reference_asset_repo_path: "video/assets/hibou-canonical-512.webp.b64",
      reference_mode: "deterministic_character_overlay",
      language: "fr",
      text_in_generated_images: false,
      branding: {
        text: "Le Hibou Rusé",
        position: "bottom-center",
        size: "small",
        color: "ink",
        source: "post-production",
      },
      pacing: {
        perceptible_beat_s: [2, 3],
        full_composition_change_s: [3, 5],
      },
      production_defaults: {
        plans_min: 8,
        plans_max: 16,
        zoom_min_pct: 1.5,
        zoom_max_pct: 3.5,
      },
    },
    engine: {
      width: 1080,
      height: 1920,
      fps: 30,
    },
    scenes: Array.from({ length: 8 }, (_, index) => ({
      scene_id: `scene-${index + 1}`,
      order: index + 1,
      planned_duration_s: 4,
    })),
    validation: {
      human_required: true,
      publication_authorized: false,
    },
    production: {
      mode: "preview",
      full_master_allowed: false,
      publication_authorized: false,
    },
    features: {
      video_timeline_v1: true,
      video_creative_qc_v1: false,
      video_pose_registry_v1: false,
      video_prosody_v1: true,
      video_music_mix_v1: true,
      video_incremental_retouch_v1: true,
      video_human_candidate_selection_v1: true,
    },
    music: {
      reference: "music.wav",
    },
  };
}

test("readiness activates only features with both GLOBAL and runtime gates", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_TIMELINE_V1: "true",
    HIBOU_VIDEO_PROSODY_V1: "false",
    HIBOU_VIDEO_MUSIC_V1: "true",
    HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1: "true",
    HIBOU_VIDEO_HUMAN_SELECTION_V1: "true",
    HIBOU_VIDEO_CREATIVE_QC_V1: "true",
  });

  assert.equal(report.schema, READINESS_SCHEMA);
  assert.equal(report.preview_only, true);
  assert.equal(report.publication_authorized, false);
  assert.equal(report.gpu_execution_performed, false);
  assert.equal(report.airtable_mutation_performed, false);
  assert.equal(report.features.video_timeline_v1.active, true);
  assert.equal(report.features.video_prosody_v1.active, false);
  assert.equal(report.features.video_music_mix_v1.active, true);
  assert.equal(report.features.video_incremental_retouch_v1.active, true);
  assert.equal(report.features.video_human_candidate_selection_v1.active, true);
  assert.equal(report.features.video_creative_qc_v1.active, false);
  assert.equal(report.warnings.some((x) =>
    x.code === "runtime_enabled_global_disabled"
    && x.feature === "video_creative_qc_v1"
  ), true);
  assert.equal(report.ready_for_cpu_planning, true);
});

test("readiness blocks preview contracts that authorize a full master", () => {
  const input = contract();
  input.production.full_master_allowed = true;
  const report = buildV5Readiness(input, {});
  assert.equal(report.ready_for_cpu_planning, false);
  assert.equal(report.blocking.some((x) =>
    x.code === "preview_cannot_allow_full_master"
  ), true);
});

test("readiness blocks any publication authorization signal", () => {
  const input = contract();
  input.validation = { publication_authorized: true };
  const report = buildV5Readiness(input, {});
  assert.equal(report.ready_for_cpu_planning, false);
  assert.equal(report.blocking.some((x) =>
    x.code === "publication_authorization_must_remain_false"
  ), true);
  assert.equal(report.publication_authorized, false);
});

test("readiness requires a music reference only when music mixing is actually active", () => {
  const input = contract();
  delete input.music.reference;

  const inactive = buildV5Readiness(input, {
    HIBOU_VIDEO_MUSIC_V1: "false",
  });
  assert.equal(inactive.ready_for_cpu_planning, true);

  const active = buildV5Readiness(input, {
    HIBOU_VIDEO_MUSIC_V1: "true",
  });
  assert.equal(active.ready_for_cpu_planning, false);
  assert.equal(active.blocking.some((x) =>
    x.code === "music_reference_required_when_music_mix_active"
  ), true);
});

test("readiness exposes remote cancel as runtime-only", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_REMOTE_CANCEL_ENABLED: "true",
  });
  assert.equal(report.features.video_remote_cancel_v1.global_enabled, null);
  assert.equal(report.features.video_remote_cancel_v1.active, true);
});

test("readiness rejects unsupported contracts", () => {
  assert.throws(
    () => buildV5Readiness({ contract_version: "OTHER" }, {}),
    /HIBOU_VIDEO_CONTRACT_V1 required/,
  );
});


test("human candidate selection double gate stays inactive without runtime opt-in", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_HUMAN_SELECTION_V1: "false",
  });
  assert.equal(
    report.features.video_human_candidate_selection_v1.global_enabled,
    true,
  );
  assert.equal(
    report.features.video_human_candidate_selection_v1.runtime_enabled,
    false,
  );
  assert.equal(
    report.features.video_human_candidate_selection_v1.active,
    false,
  );
  assert.equal(
    report.warnings.some(
      (x) =>
        x.code === "global_enabled_runtime_disabled"
        && x.feature === "video_human_candidate_selection_v1",
    ),
    true,
  );
});


test("readiness blocks creative identity drift before any GPU planning", () => {
  const input = contract();
  input.creative.branding.color = "sand";
  input.creative.reference_mode = "generative_character";
  input.creative.text_in_generated_images = true;
  const report = buildV5Readiness(input, {});
  assert.equal(report.ready_for_cpu_planning, false);
  assert.equal(report.blocking.some((x) =>
    x.code === "canonical_branding_mismatch" && x.field === "color"
  ), true);
  assert.equal(report.blocking.some((x) =>
    x.code === "deterministic_character_overlay_required"
  ), true);
  assert.equal(report.blocking.some((x) =>
    x.code === "generated_image_text_must_be_disabled"
  ), true);
});

test("readiness blocks geometry, review and scene contract regressions", () => {
  const input = contract();
  input.engine.width = 720;
  input.validation.human_required = false;
  input.scenes[2].order = 7;
  input.scenes[3].planned_duration_s = 0.5;
  const report = buildV5Readiness(input, {});
  assert.equal(report.ready_for_cpu_planning, false);
  for (const code of [
    "mobile_render_geometry_mismatch",
    "human_review_must_be_required",
    "scene_order_not_contiguous",
    "scene_duration_outside_allowed_bounds",
  ]) {
    assert.equal(report.blocking.some((x) => x.code === code), true);
  }
});

test("readiness warns rather than blocks when scene count is outside the profile target but inside hard bounds", () => {
  const input = contract();
  input.creative.production_defaults.plans_min = 10;
  const report = buildV5Readiness(input, {});
  assert.equal(report.ready_for_cpu_planning, true);
  assert.equal(report.warnings.some((x) =>
    x.code === "scene_count_outside_profile_target"
  ), true);
});

test("readiness exposes the canonical runtime invariants used to resolve Airtable wording conflicts", () => {
  const report = buildV5Readiness(contract(), {});
  assert.deepEqual(report.canonical_invariants.branding, {
    text: "Le Hibou Rusé",
    position: "bottom-center",
    size: "small",
    color: "ink",
    source: "post-production",
  });
  assert.deepEqual(report.canonical_invariants.render_geometry, {
    width: 1080,
    height: 1920,
    fps: 30,
  });
});
