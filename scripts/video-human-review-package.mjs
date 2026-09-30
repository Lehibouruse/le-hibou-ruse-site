#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { negativePolicyCoveragePass } from "./video-negative-policy-coverage.mjs";

export const HUMAN_REVIEW_SCHEMA = "HIBOU_HUMAN_REVIEW_PACKAGE_V1";

function loadIf(path) {
  return existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : null;
}

function status(value) {
  return String(value || "").trim().toUpperCase();
}

function add(items, code, detail = null) {
  items.push(detail == null ? { code } : { code, detail });
}

function checklistItem(id, label, machineEvidence = []) {
  return {
    id,
    label,
    status: "PENDING_HUMAN",
    machine_evidence: machineEvidence.filter(Boolean),
    human_note: null,
    human_pass: null,
  };
}

export function buildHumanReviewPackage({
  masterResult = null,
  masterQc = null,
  creativeQc = null,
  candidateReview = null,
  imagePlan = null,
  storyboard = null,
  artifactRegistry = null,
  incrementalPlan = null,
  reviewDiff = null,
} = {}) {
  const blockers = [];
  const warnings = [];
  const negativeCoverage = imagePlan?.negative_policy_coverage || null;
  const negativePolicyRequired = storyboard?.content?.source === "airtable" ||
    imagePlan?.creative_contract_enforced === true;
  const negativeCoverageValid = negativePolicyCoveragePass(
    negativeCoverage, storyboard?.creative?.negative_prompt,
  );
  if (negativePolicyRequired && !negativeCoverageValid) {
    add(blockers, "global_negative_policy_coverage_missing_or_incomplete");
  }

  const productionMode = String(
    masterResult?.production_mode ||
      masterResult?.execution_profile?.production_mode ||
      artifactRegistry?.production_mode ||
      "final",
  ).toLowerCase() === "preview"
    ? "preview"
    : "final";

  const previewOnly =
    productionMode === "preview" ||
    masterResult?.preview_only === true ||
    artifactRegistry?.preview_only === true;

  if (!masterResult) add(blockers, "master_result_missing");

  if (!masterQc) {
    add(blockers, "master_qc_missing");
  } else {
    const masterStatus = status(masterQc.status);
    if (!["PASS", "REVIEW"].includes(masterStatus)) {
      add(blockers, "master_qc_invalid_status", masterStatus || null);
    } else if (masterStatus === "REVIEW") {
      add(warnings, "master_qc_requires_attention");
    }
  }

  if (creativeQc) {
    const creativeStatus = status(creativeQc.status);
    if (creativeStatus === "REJECT") {
      add(blockers, "creative_qc_reject");
    } else if (creativeStatus && creativeStatus !== "PASS") {
      add(warnings, "creative_qc_non_pass", creativeStatus);
    }
  } else if (masterResult?.features?.video_creative_qc_v1 === true) {
    add(blockers, "creative_qc_missing_while_enabled");
  } else {
    add(warnings, "creative_qc_not_available");
  }

  if (candidateReview) {
    if (Number(candidateReview.blocking_scene_count || 0) > 0) {
      add(
        blockers,
        "candidate_review_has_blocking_scenes",
        Number(candidateReview.blocking_scene_count || 0),
      );
    }
    if (candidateReview.human_review_required !== true) {
      add(blockers, "candidate_review_human_gate_missing");
    }
  } else {
    add(warnings, "candidate_review_not_available");
  }

  if (
    artifactRegistry &&
    artifactRegistry.publication_authorized === true
  ) {
    add(blockers, "artifact_registry_publication_must_be_false");
  }

  if (masterResult?.publication_authorized === true) {
    add(blockers, "master_result_publication_must_be_false");
  }

  const checklist = [
    checklistItem(
      "voice_natural",
      "Voix naturelle, non métallique, sans sensation de TTS générique",
      [masterResult?.features?.video_prosody_v1 ? "prosody_v1_active" : null],
    ),
    checklistItem(
      "prosody_varies",
      "Prosodie réellement variable selon les phrases et le sens",
      [masterResult?.features?.video_prosody_v1 ? "prosody_v1_active" : null],
    ),
    checklistItem(
      "no_unwanted_humans",
      "Aucun humain indésirable dans les visuels",
      [creativeQc ? `creative_qc:${status(creativeQc.status) || "UNKNOWN"}` : null],
    ),
    checklistItem(
      "hibou_stable_premium",
      "Hibou stable, reconnaissable et premium",
      [creativeQc ? `creative_qc:${status(creativeQc.status) || "UNKNOWN"}` : null],
    ),
    checklistItem(
      "hero_opening",
      "Ouverture hero-shot du Hibou et univers visuel convaincants",
    ),
    checklistItem(
      "rhythm_not_frenetic",
      "Rythme non frénétique, changements visuels motivés par le sens",
      [masterQc ? `master_qc:${status(masterQc.status) || "UNKNOWN"}` : null],
    ),
    checklistItem(
      "editorial_cartoon_consistency",
      "Style cartoon éditorial adulte cohérent sur toute la vidéo",
      [creativeQc ? `creative_qc:${status(creativeQc.status) || "UNKNOWN"}` : null],
    ),
    checklistItem(
      "branding_unique",
      "Branding « Le Hibou Rusé » unique, sans doublon parasite",
    ),
    checklistItem(
      "captions_mobile_readable",
      "Captions et callouts lisibles sur mobile, hiérarchie claire",
      [masterQc ? `master_qc:${status(masterQc.status) || "UNKNOWN"}` : null],
    ),
    checklistItem(
      "original_identity",
      "Aucune dérive vers une imitation identifiable d’un concurrent",
    ),
    ...(negativeCoverageValid ? negativeCoverage.groups : []).map(group => ({
      ...checklistItem(
        String(group.human_review_check_id || `negative_${group.id}`),
        String(group.label || group.id),
        (group.machine_evidence || []).map(String),
      ),
      source_exclusions: (group.clauses || []).map(String),
      negative_policy_source_sha256: negativeCoverage.source_sha256,
    })),
  ];

  const changedScenes = Array.isArray(incrementalPlan?.changed_scene_ids)
    ? incrementalPlan.changed_scene_ids
    : [];

  const reviewDiffValid =
    reviewDiff?.schema === "HIBOU_INCREMENTAL_REVIEW_DIFF_V1";
  if (incrementalPlan && !reviewDiff) {
    add(warnings, "incremental_review_diff_not_available");
  } else if (incrementalPlan && reviewDiff && !reviewDiffValid) {
    add(warnings, "incremental_review_diff_invalid_schema");
  }

  const focusedSceneReview =
    reviewDiffValid && Array.isArray(reviewDiff?.focused_scene_review)
      ? reviewDiff.focused_scene_review
      : [];
  const sceneReviewQueue = focusedSceneReview.map((scene) => ({
    scene_id: String(scene?.scene_id || ""),
    status: String(scene?.status || "modified"),
    changed_domains: Array.isArray(scene?.changed_domains)
      ? scene.changed_domains.map(String)
      : [],
    reason_codes: Array.isArray(scene?.reason_codes)
      ? scene.reason_codes.map(String)
      : [],
    focused_human_checks: Array.isArray(scene?.focused_human_checks)
      ? scene.focused_human_checks.map(String)
      : [],
    execution_impact:
      scene?.execution_impact &&
      typeof scene.execution_impact === "object" &&
      !Array.isArray(scene.execution_impact)
        ? scene.execution_impact
        : null,
    human_decision: "PENDING",
    human_note: null,
  }));

  return {
    schema: HUMAN_REVIEW_SCHEMA,
    production_mode: productionMode,
    preview_only: previewOnly,
    decision: "PENDING_HUMAN_REVIEW",
    human_approved: false,
    eligible_for_human_review: Boolean(masterResult),
    eligible_for_final_approval:
      productionMode === "final" &&
      !previewOnly &&
      blockers.length === 0,
    machine_blockers: blockers,
    machine_warnings: warnings,
    incremental_context: incrementalPlan
      ? {
          changed_scene_ids: changedScenes,
          unchanged_scene_ids: Array.isArray(incrementalPlan.unchanged_scene_ids)
            ? incrementalPlan.unchanged_scene_ids
            : [],
          invalidated_stages: Array.isArray(incrementalPlan.invalidated_stages)
            ? incrementalPlan.invalidated_stages
            : [],
          review_diff_available: reviewDiffValid,
          review_scope: reviewDiffValid
            ? reviewDiff.review_scope || "FULL"
            : "FULL",
          full_review_required: reviewDiffValid
            ? Boolean(reviewDiff.full_review_required)
            : true,
          human_should_focus_changed_scenes:
            reviewDiffValid
              ? sceneReviewQueue.length > 0
              : changedScenes.length > 0,
          review_summary:
            reviewDiffValid &&
            reviewDiff?.review_summary &&
            typeof reviewDiff.review_summary === "object"
              ? reviewDiff.review_summary
              : null,
          execution_summary:
            reviewDiffValid &&
            reviewDiff?.execution_summary &&
            typeof reviewDiff.execution_summary === "object"
              ? reviewDiff.execution_summary
              : null,
          scene_review_queue: sceneReviewQueue,
          focused_scene_review: focusedSceneReview,
          global_focused_checks:
            reviewDiffValid && Array.isArray(reviewDiff?.global_focused_checks)
              ? reviewDiff.global_focused_checks
              : [],
          always_required_global_checks:
            reviewDiffValid &&
            Array.isArray(reviewDiff?.always_required_global_checks)
              ? reviewDiff.always_required_global_checks
              : [],
          unchanged_scenes_may_reference_previous_review:
            reviewDiffValid
              ? Boolean(reviewDiff.unchanged_scenes_may_reference_previous_review)
              : false,
          unchanged_scenes_auto_approved: false,
          previous_human_approval_auto_reused: false,
        }
      : null,
    checklist,
    negative_policy_source_sha256: negativeCoverageValid ? negativeCoverage.source_sha256 : null,
    negative_policy_clause_count: negativeCoverageValid ? negativeCoverage.clause_count : 0,
    negative_policy_review_check_ids: (negativeCoverageValid ? negativeCoverage.groups : []).map(group =>
      String(group.human_review_check_id || `negative_${group.id}`)),
    policy: {
      machine_checks_never_equal_editorial_approval: true,
      all_checklist_items_require_human_decision: true,
      preview_cannot_be_finally_approved: true,
      publication_requires_separate_explicit_human_action: true,
      negative_policy_checks_require_pass_status_and_human_pass: true,
      negative_policy_coverage_is_not_pixel_compliance: true,
    },
    human_review_required: true,
    publication_authorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [rootArg, outputArg] = process.argv.slice(2);
  if (!rootArg) {
    throw new Error(
      "usage: node scripts/video-human-review-package.mjs <render-root> [human-review.json]",
    );
  }

  const root = resolve(rootArg);
  const output = resolve(outputArg || resolve(root, "human-review.json"));

  const review = buildHumanReviewPackage({
    masterResult: loadIf(resolve(root, "master-result.json")),
    masterQc: loadIf(resolve(root, "master-qc.json")),
    creativeQc: loadIf(resolve(root, "creative-qc.json")),
    candidateReview: loadIf(resolve(root, "images", "candidate-review.json")),
    imagePlan: loadIf(resolve(root, "images", "image-plan.json")),
    storyboard: loadIf(resolve(root, "storyboard.json")),
    artifactRegistry: loadIf(resolve(root, "artifact-registry.json")),
    incrementalPlan: loadIf(resolve(root, "incremental-retouch-plan.json")),
    reviewDiff: loadIf(resolve(root, "review-diff.json")),
  });

  writeFileSync(output, JSON.stringify(review, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: review.schema,
      production_mode: review.production_mode,
      preview_only: review.preview_only,
      blockers: review.machine_blockers.length,
      warnings: review.machine_warnings.length,
      eligible_for_final_approval: review.eligible_for_final_approval,
      human_review_required: true,
      publication_authorized: false,
    }) + "\n",
  );
}
