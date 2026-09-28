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
    content: { content_id: "recCONTENT1234567" },
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


test("remote repair prepare-only mode is allowed but explicit", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED: "true",
    HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED: "false",
  });

  assert.equal(
    report.features.video_remote_repair_resume_v1.active,
    true,
  );
  assert.equal(
    report.features.video_remote_repair_start_v1.active,
    false,
  );
  assert.equal(report.ready_for_cpu_planning, true);
  assert.equal(
    report.warnings.some(
      (x) => x.code === "remote_repair_prepare_only_mode",
    ),
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.phase_order_valid,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.second_human_confirmation_required,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.publication_authorized,
    false,
  );
});

test("remote repair start cannot be enabled without prepare gate", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED: "false",
    HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED: "true",
  });

  assert.equal(report.ready_for_cpu_planning, false);
  assert.equal(
    report.blocking.some(
      (x) => x.code === "remote_repair_start_requires_resume_gate",
    ),
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.phase_order_valid,
    false,
  );
});

test("two-phase remote repair is visible as runtime-only and double-confirmed", () => {
  const report = buildV5Readiness(contract(), {
    HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED: "true",
    HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED: "true",
  });

  assert.equal(report.ready_for_cpu_planning, true);
  assert.equal(
    report.features.video_remote_repair_resume_v1.global_enabled,
    null,
  );
  assert.equal(
    report.features.video_remote_repair_start_v1.global_enabled,
    null,
  );
  assert.equal(
    report.activation_guards.remote_repair.prepare_enabled,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.start_enabled,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.first_human_confirmation_required,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.second_human_confirmation_required,
    true,
  );
  assert.equal(
    report.activation_guards.remote_repair.one_shot_requests_required,
    true,
  );
});
