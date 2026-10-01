#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REVIEW_DIFF_SCHEMA = "HIBOU_INCREMENTAL_REVIEW_DIFF_V1";

function fail(message) {
  throw new Error(message);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const DOMAIN_CHECKS = {
  timing: [
    "rhythm_not_frenetic",
    "audio_video_sync",
  ],
  voice: [
    "voice_natural",
    "prosody_varies",
    "audio_video_sync",
  ],
  image: [
    "no_unwanted_humans",
    "hibou_stable_premium",
    "editorial_cartoon_consistency",
    "original_identity",
  ],
  composition: [
    "rhythm_not_frenetic",
    "editorial_cartoon_consistency",
    "captions_mobile_readable",
  ],
  captions: [
    "captions_mobile_readable",
    "branding_unique",
  ],
  structure: [
    "full_scene_flow",
    "rhythm_not_frenetic",
    "audio_video_sync",
    "captions_mobile_readable",
  ],
};

const GLOBAL_CHECKS = {
  style: [
    "hibou_stable_premium",
    "editorial_cartoon_consistency",
    "original_identity",
    "no_unwanted_humans",
  ],
  branding: [
    "branding_unique",
    "captions_mobile_readable",
  ],
  music: [
    "audio_video_sync",
    "voice_remains_intelligible",
  ],
  engine: [
    "full_video_sanity",
    "audio_video_sync",
  ],
  features: [
    "full_video_sanity",
    "full_scene_flow",
    "audio_video_sync",
  ],
  production: [
    "full_video_sanity",
    "captions_mobile_readable",
  ],
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stringSet(values) {
  return new Set(asArray(values).map((value) => String(value || "")).filter(Boolean));
}

function sceneExecutionImpact(iterationPlan, sceneId, status) {
  const invalidated = iterationPlan?.invalidated_scene_ids || {};
  const reusable = iterationPlan?.reusable_scene_ids || {};
  const invalidatedStages = stringSet(iterationPlan?.invalidated_stages);
  const id = String(sceneId || "");
  const removed = status === "removed";

  const voiceInvalidated = stringSet(invalidated.voice).has(id);
  const imageInvalidated = stringSet(invalidated.images).has(id);
  const creativeQcInvalidated = stringSet(invalidated.creative_qc).has(id);
  const renderInvalidated = stringSet(invalidated.render).has(id);

  return {
    scene_present_in_next_contract: !removed,
    voice_stage_revalidation_required: invalidatedStages.has("voice"),
    image_stage_revalidation_required: invalidatedStages.has("images"),
    creative_qc_stage_revalidation_required:
      invalidatedStages.has("creative_qc"),
    render_stage_revalidation_required: invalidatedStages.has("render"),
    voice_regeneration_forced_by_planner: voiceInvalidated,
    image_regeneration_forced_by_planner: imageInvalidated,
    creative_qc_forced_by_planner: creativeQcInvalidated,
    scene_rerender_forced_by_planner: renderInvalidated,
    voice_cache_reusable:
      !removed && stringSet(reusable.voice).has(id),
    image_cache_reusable:
      !removed && stringSet(reusable.images).has(id),
    render_cache_reusable:
      !removed && stringSet(reusable.render).has(id),
    cache_reuse_subject_to_fingerprint: !removed,
  };
}

function impactReasonCodes(status, domains, impact) {
  const codes = [
    `scene_status_${String(status || "modified")}`,
    ...domains.map((domain) => `changed_domain_${domain}`),
  ];
  if (impact.voice_stage_revalidation_required) {
    codes.push("voice_stage_revalidation_required");
  }
  if (impact.image_stage_revalidation_required) {
    codes.push("image_stage_revalidation_required");
  }
  if (impact.creative_qc_stage_revalidation_required) {
    codes.push("creative_qc_stage_revalidation_required");
  }
  if (impact.render_stage_revalidation_required) {
    codes.push("render_stage_revalidation_required");
  }
  if (impact.voice_regeneration_forced_by_planner) {
    codes.push("voice_regeneration_forced_by_planner");
  }
  if (impact.image_regeneration_forced_by_planner) {
    codes.push("image_regeneration_forced_by_planner");
  }
  if (impact.creative_qc_forced_by_planner) {
    codes.push("creative_qc_forced_by_planner");
  }
  if (impact.scene_rerender_forced_by_planner) {
    codes.push("scene_rerender_forced_by_planner");
  }
  if (!impact.scene_present_in_next_contract) {
    codes.push("scene_removed_from_next_contract");
  }
  return unique(codes);
}

export function buildIncrementalReviewDiff(iterationPlan) {
  if (iterationPlan?.schema !== "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1") {
    fail("HIBOU_INCREMENTAL_RETOUCH_PLAN_V1 required");
  }

  const sceneReview = asArray(iterationPlan.scene_changes)
    .filter((scene) => scene?.status !== "unchanged")
    .map((scene) => {
      const domains = asArray(scene?.changed_domains).map(String);
      const checks = unique(
        domains.flatMap((domain) => DOMAIN_CHECKS[domain] || ["full_video_sanity"]),
      );

      if (
        String(scene?.scene_id || "") === "S01"
        && domains.some((domain) =>
          ["image", "composition", "structure"].includes(domain),
        )
      ) {
        checks.push("hero_opening");
      }

      const sceneId = String(scene?.scene_id || "");
      const status = String(scene?.status || "modified");
      const executionImpact = sceneExecutionImpact(
        iterationPlan,
        sceneId,
        status,
      );

      return {
        scene_id: sceneId,
        status,
        changed_domains: domains,
        focused_human_checks: unique(checks),
        execution_impact: executionImpact,
        reason_codes: impactReasonCodes(
          status,
          domains,
          executionImpact,
        ),
        previous_approval_auto_reused: false,
        human_review_required: true,
      };
    });

  const globalChanges = asArray(iterationPlan.global_changes).map(String);
  const globalFocusedChecks = unique(
    globalChanges.flatMap(
      (domain) => GLOBAL_CHECKS[domain] || ["full_video_sanity"],
    ),
  );

  const alwaysRequiredChecks = [
    "full_video_sanity",
    "opening_and_ending",
    "audio_video_sync",
    "unexpected_artifacts",
    "publication_lock",
  ];

  const fullReviewRequired =
    iterationPlan.structural_change === true
    || globalChanges.includes("style")
    || globalChanges.includes("features")
    || sceneReview.length === 0;

  const invalidatedSceneIds = {
    voice: unique(asArray(iterationPlan?.invalidated_scene_ids?.voice).map(String)),
    images: unique(asArray(iterationPlan?.invalidated_scene_ids?.images).map(String)),
    creative_qc: unique(
      asArray(iterationPlan?.invalidated_scene_ids?.creative_qc).map(String),
    ),
    render: unique(asArray(iterationPlan?.invalidated_scene_ids?.render).map(String)),
  };
  const reusableSceneIds = {
    voice: unique(asArray(iterationPlan?.reusable_scene_ids?.voice).map(String)),
    images: unique(asArray(iterationPlan?.reusable_scene_ids?.images).map(String)),
    render: unique(asArray(iterationPlan?.reusable_scene_ids?.render).map(String)),
  };
  const changedSceneIds = asArray(iterationPlan.changed_scene_ids).map(String);
  const unchangedSceneIds = asArray(iterationPlan.unchanged_scene_ids).map(String);

  const reviewSummary = {
    changed_scene_count: changedSceneIds.length,
    unchanged_scene_count: unchangedSceneIds.length,
    focused_scene_count: sceneReview.length,
    modified_scene_count: sceneReview.filter((scene) => scene.status === "modified").length,
    added_scene_count: sceneReview.filter((scene) => scene.status === "added").length,
    removed_scene_count: sceneReview.filter((scene) => scene.status === "removed").length,
    global_change_count: globalChanges.length,
    full_review_required: fullReviewRequired,
    focused_review_allowed: !fullReviewRequired,
  };

  const executionSummary = {
    invalidated_stages: unique(asArray(iterationPlan.invalidated_stages).map(String)),
    invalidated_scene_ids: invalidatedSceneIds,
    reusable_scene_ids: reusableSceneIds,
    forced_regeneration_counts: {
      voice: invalidatedSceneIds.voice.length,
      images: invalidatedSceneIds.images.length,
      creative_qc: invalidatedSceneIds.creative_qc.length,
      render: invalidatedSceneIds.render.length,
    },
    reusable_counts: {
      voice: reusableSceneIds.voice.length,
      images: reusableSceneIds.images.length,
      render: reusableSceneIds.render.length,
    },
  };

  return {
    schema: REVIEW_DIFF_SCHEMA,
    content_id: iterationPlan.content_id || null,
    source_iteration_schema: iterationPlan.schema,
    previous_contract_sha256:
      iterationPlan.previous_contract_sha256 || null,
    next_contract_sha256:
      iterationPlan.next_contract_sha256 || null,
    structural_change: Boolean(iterationPlan.structural_change),
    global_changes: globalChanges,
    changed_scene_ids: changedSceneIds,
    unchanged_scene_ids: unchangedSceneIds,
    focused_scene_review: sceneReview,
    review_summary: reviewSummary,
    execution_summary: executionSummary,
    global_focused_checks: globalFocusedChecks,
    always_required_global_checks: alwaysRequiredChecks,
    review_scope: fullReviewRequired ? "FULL" : "FOCUSED_PLUS_GLOBAL_SANITY",
    full_review_required: fullReviewRequired,
    unchanged_scenes_may_reference_previous_review: !fullReviewRequired,
    unchanged_scenes_auto_approved: false,
    previous_human_approval_auto_reused: false,
    policy: {
      focus_does_not_equal_approval: true,
      unchanged_scene_review_can_be_referenced_but_not_auto_copied: true,
      global_sanity_checks_always_required: true,
      human_review_required: true,
      publication_authorized: false,
    },
    human_review_required: true,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [iterationPlanPath, outputPath] = process.argv.slice(2);
  if (!iterationPlanPath || !outputPath) {
    fail(
      "usage: node scripts/video-review-diff.mjs incremental-retouch-plan.json review-diff.json",
    );
  }

  const diff = buildIncrementalReviewDiff(
    JSON.parse(readFileSync(resolve(iterationPlanPath), "utf8")),
  );
  writeFileSync(resolve(outputPath), JSON.stringify(diff, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: diff.schema,
      review_scope: diff.review_scope,
      changed_scenes: diff.changed_scene_ids.length,
      rerender_scenes_forced_by_planner:
        diff.execution_summary.forced_regeneration_counts.render,
      reusable_render_scenes: diff.execution_summary.reusable_counts.render,
      full_review_required: diff.full_review_required,
      human_review_required: true,
      publication_authorized: false,
    }) + "\n",
  );
}
