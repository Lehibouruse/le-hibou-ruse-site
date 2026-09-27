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

      return {
        scene_id: String(scene?.scene_id || ""),
        status: String(scene?.status || "modified"),
        changed_domains: domains,
        focused_human_checks: unique(checks),
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
    changed_scene_ids: asArray(iterationPlan.changed_scene_ids),
    unchanged_scene_ids: asArray(iterationPlan.unchanged_scene_ids),
    focused_scene_review: sceneReview,
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
      full_review_required: diff.full_review_required,
      human_review_required: true,
      publication_authorized: false,
    }) + "\n",
  );
}
