#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CANDIDATE_REVIEW_SCHEMA = "HIBOU_CANDIDATE_REVIEW_V1";

function fail(message) {
  throw new Error(message);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function byCandidate(plan) {
  return new Map(
    asArray(plan?.requests).map((request) => [
      String(request?.candidate_id || ""),
      request,
    ]),
  );
}

function provisionalCandidate(provisional, sceneId) {
  const row = asObject(provisional)[sceneId];
  return String(row?.selected_candidate_id || "") || null;
}

export function buildCandidateReview({
  plan,
  perceptualQc,
  provisionalSelections = {},
} = {}) {
  if (plan?.schema !== "HIBOU_IMAGE_PLAN_V1") {
    fail("HIBOU_IMAGE_PLAN_V1 required");
  }
  if (perceptualQc?.schema !== "HIBOU_IMAGE_PERCEPTUAL_QC_V1") {
    fail("HIBOU_IMAGE_PERCEPTUAL_QC_V1 required");
  }

  const requests = byCandidate(plan);
  const scenes = new Map();

  for (const row of asArray(perceptualQc.rows)) {
    const sceneId = String(row?.scene_id || "").trim();
    const candidateId = String(row?.candidate_id || "").trim();
    if (!sceneId || !candidateId) continue;

    const request = requests.get(candidateId) || {};
    const candidate = {
      candidate_id: candidateId,
      candidate: Number(row?.candidate ?? request?.candidate ?? 0) || null,
      path: String(row?.path || "") || null,
      status: String(row?.status || "UNKNOWN"),
      perceptual_score: Number.isFinite(Number(row?.perceptual_score))
        ? Number(row.perceptual_score)
        : null,
      reasons: asArray(row?.reasons).map(String),
      warnings: asArray(row?.warnings).map(String),
      seed: Number.isFinite(Number(request?.seed)) ? Number(request.seed) : null,
      request_fingerprint: String(
        request?.request_fingerprint || row?.request_fingerprint || "",
      ) || null,
      machine_rank_only: true,
      human_approved: false,
    };

    const list = scenes.get(sceneId) || [];
    list.push(candidate);
    scenes.set(sceneId, list);
  }

  const outputScenes = [];
  let blockingSceneCount = 0;

  for (const [sceneId, candidates] of scenes.entries()) {
    candidates.sort((a, b) => {
      const aPass = a.status === "PASS" ? 0 : 1;
      const bPass = b.status === "PASS" ? 0 : 1;
      if (aPass !== bPass) return aPass - bPass;
      const aScore = a.perceptual_score ?? -1;
      const bScore = b.perceptual_score ?? -1;
      if (aScore !== bScore) return bScore - aScore;
      return Number(a.candidate || 999) - Number(b.candidate || 999);
    });

    const passing = candidates.filter((candidate) => candidate.status === "PASS");
    const provisionalId = provisionalCandidate(provisionalSelections, sceneId);
    const machineRecommended =
      provisionalId && candidates.some((x) => x.candidate_id === provisionalId)
        ? provisionalId
        : passing[0]?.candidate_id || null;
    const reviewable = passing.length > 0;

    if (!reviewable) blockingSceneCount += 1;

    outputScenes.push({
      scene_id: sceneId,
      machine_recommended_candidate_id: machineRecommended,
      ranking_is_advisory: true,
      passing_candidate_count: passing.length,
      candidate_count: candidates.length,
      reviewable,
      human_selected_candidate_id: null,
      human_decision: "PENDING",
      human_review_required: true,
      candidates,
    });
  }

  return {
    schema: CANDIDATE_REVIEW_SCHEMA,
    content_id: String(plan?.content_id || perceptualQc?.content_id || "") || null,
    scene_count: outputScenes.length,
    blocking_scene_count: blockingSceneCount,
    all_scenes_reviewable: blockingSceneCount === 0,
    scenes: outputScenes,
    policy: {
      machine_ranking_is_advisory_only: true,
      human_selection_required: true,
      no_candidate_is_auto_approved: true,
      local_only: true,
      paid_fallback: false,
      publication_authorized: false,
    },
    human_review_required: true,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [planPath, perceptualPath, provisionalPath, outputPath] =
    process.argv.slice(2);

  if (!planPath || !perceptualPath || !provisionalPath || !outputPath) {
    fail(
      "usage: node scripts/video-candidate-review.mjs image-plan.json image-perceptual-qc.json selections.provisional.json candidate-review.json",
    );
  }

  const review = buildCandidateReview({
    plan: JSON.parse(readFileSync(resolve(planPath), "utf8")),
    perceptualQc: JSON.parse(readFileSync(resolve(perceptualPath), "utf8")),
    provisionalSelections: JSON.parse(
      readFileSync(resolve(provisionalPath), "utf8"),
    ),
  });

  writeFileSync(resolve(outputPath), JSON.stringify(review, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: review.schema,
      scene_count: review.scene_count,
      blocking_scene_count: review.blocking_scene_count,
      human_review_required: true,
      publication_authorized: false,
    }) + "\n",
  );

  if (!review.all_scenes_reviewable) process.exitCode = 2;
}
