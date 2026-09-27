#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  artifactRegistry = null,
  incrementalPlan = null,
  reviewDiff = null,
} = {}) {
  const blockers = [];
  const warnings = [];

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
  ];

  const changedScenes = Array.isArray(incrementalPlan?.changed_scene_ids)
    ? incrementalPlan.changed_scene_ids
    : [];

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
          invalidated_stages: Array.isArray(incrementalPlan.invalidated_stages)
            ? incrementalPlan.invalidated_stages
            : [],
          human_should_focus_changed_scenes: changedScenes.length > 0,
          review_scope:reviewDiff?.review_scope||"FULL",
          full_review_required:reviewDiff
            ? Boolean(reviewDiff.full_review_required)
            : true,
          focused_scene_review:Array.isArray(reviewDiff?.focused_scene_review)
            ? reviewDiff.focused_scene_review
            : [],
          global_focused_checks:Array.isArray(reviewDiff?.global_focused_checks)
            ? reviewDiff.global_focused_checks
            : [],
          always_required_global_checks:Array.isArray(reviewDiff?.always_required_global_checks)
            ? reviewDiff.always_required_global_checks
            : [],
          previous_human_approval_auto_reused:false,
        }
      : null,
    checklist,
    policy: {
      machine_checks_never_equal_editorial_approval: true,
      all_checklist_items_require_human_decision: true,
      preview_cannot_be_finally_approved: true,
      publication_requires_separate_explicit_human_action: true,
    },
    human_review_required: true,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
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
