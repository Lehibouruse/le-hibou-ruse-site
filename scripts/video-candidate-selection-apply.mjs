#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HUMAN_IMAGE_SELECTION_SCHEMA = "HIBOU_HUMAN_IMAGE_SELECTION_V1";

function fail(message) {
  throw new Error(message);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function applyHumanCandidateSelection({
  review,
  decisions,
} = {}) {
  if (review?.schema !== "HIBOU_CANDIDATE_REVIEW_V1") {
    fail("HIBOU_CANDIDATE_REVIEW_V1 required");
  }
  if (decisions?.schema !== HUMAN_IMAGE_SELECTION_SCHEMA) {
    fail("HIBOU_HUMAN_IMAGE_SELECTION_V1 required");
  }
  const reviewPromptRef=review?.prompt_contract_ref;
  const decisionPromptRef=decisions?.prompt_contract_ref;
  if(reviewPromptRef?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
    fail("candidate review prompt contract ref missing");
  }
  if(decisionPromptRef?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
    fail("candidate decisions prompt contract ref missing");
  }
  if(
    reviewPromptRef.contract_sha256!==decisionPromptRef.contract_sha256 ||
    reviewPromptRef.global_sha256!==decisionPromptRef.global_sha256
  ){
    fail("candidate decisions prompt contract mismatch");
  }

  const reviewContent = String(review?.content_id || "");
  const decisionContent = String(decisions?.content_id || "");
  if (
    reviewContent &&
    decisionContent &&
    reviewContent !== decisionContent
  ) {
    fail("candidate selection content_id mismatch");
  }

  const reviewFingerprint = String(
    review?.review_fingerprint_sha256 || "",
  ).trim().toLowerCase();
  const decisionFingerprint = String(
    decisions?.review_fingerprint_sha256 || "",
  ).trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(reviewFingerprint)) {
    fail("candidate review fingerprint missing or invalid");
  }
  if (decisionFingerprint !== reviewFingerprint) {
    fail("candidate selection review fingerprint mismatch");
  }

  const decisionMap = asObject(decisions?.decisions);
  const selections = {};
  const audit = [];
  const missing = [];

  for (const scene of asArray(review.scenes)) {
    const sceneId = String(scene?.scene_id || "").trim();
    if (!sceneId) continue;

    const candidates = asArray(scene?.candidates);
    const passing = candidates.filter((candidate) => candidate?.status === "PASS");
    const decision = asObject(decisionMap[sceneId]);

    if (!scene.reviewable || passing.length === 0) {
      audit.push({
        scene_id: sceneId,
        status: "NOT_REVIEWABLE",
        selected_candidate_id: null,
      });
      continue;
    }

    const selectedId = String(decision?.candidate_id || "").trim();
    if (!selectedId) {
      missing.push(sceneId);
      continue;
    }

    const selected = candidates.find(
      (candidate) => String(candidate?.candidate_id || "") === selectedId,
    );
    if (!selected) {
      fail(`${sceneId}: selected candidate does not belong to scene`);
    }
    if (selected.status !== "PASS") {
      fail(`${sceneId}: selected candidate must have PASS status`);
    }
    if (decision.human_confirmed !== true) {
      fail(`${sceneId}: human_confirmed=true required`);
    }
    const selectedPromptRef=selected?.prompt_contract_ref;
    if(selectedPromptRef?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
      fail(`${sceneId}: selected candidate prompt contract ref missing`);
    }
    if(
      selectedPromptRef.contract_sha256!==reviewPromptRef.contract_sha256 ||
      selectedPromptRef.global_sha256!==reviewPromptRef.global_sha256 ||
      selectedPromptRef.scene_id!==sceneId
    ){
      fail(`${sceneId}: selected candidate prompt contract ref mismatch`);
    }

    selections[sceneId] = {
      candidates: candidates
        .filter((candidate) => candidate?.path)
        .map((candidate) => candidate.path),
      selected: selected.path || null,
      selected_candidate_id: selectedId,
      selection_reason: "explicit human candidate review",
      human_selected: true,
      human_note: String(decision?.note || "") || null,
      prompt_contract_ref: structuredClone(selectedPromptRef),
      machine_recommended_candidate_id:
        String(scene?.machine_recommended_candidate_id || "") || null,
      publication_authorized: false,
    };

    audit.push({
      scene_id: sceneId,
      status: "HUMAN_SELECTED",
      selected_candidate_id: selectedId,
      machine_recommended_candidate_id:
        String(scene?.machine_recommended_candidate_id || "") || null,
      followed_machine_recommendation:
        selectedId === String(scene?.machine_recommended_candidate_id || ""),
      human_note: String(decision?.note || "") || null,
    });
  }

  if (missing.length) {
    fail(
      "human selection missing for reviewable scenes: " +
        missing.join(", "),
    );
  }

  const unexpected = Object.keys(decisionMap).filter(
    (sceneId) =>
      !asArray(review.scenes).some(
        (scene) => String(scene?.scene_id || "") === sceneId,
      ),
  );
  if (unexpected.length) {
    fail("human selection contains unknown scenes: " + unexpected.join(", "));
  }

  return {
    schema: HUMAN_IMAGE_SELECTION_SCHEMA,
    content_id: reviewContent || decisionContent || null,
    review_fingerprint_sha256: reviewFingerprint,
    prompt_contract_ref: structuredClone(reviewPromptRef),
    selection_count: Object.keys(selections).length,
    selections,
    audit,
    policy: {
      only_pass_candidates_can_be_selected: true,
      explicit_human_confirmation_required: true,
      machine_recommendation_is_not_binding: true,
      stale_review_fingerprint_rejected: true,
      publication_authorized: false,
    },
    human_review_required: true,
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [reviewPath, decisionsPath, selectionsPath, manifestPath] =
    process.argv.slice(2);

  if (!reviewPath || !decisionsPath || !selectionsPath) {
    fail(
      "usage: node scripts/video-candidate-selection-apply.mjs candidate-review.json candidate-decisions.json selections.human.json [selection-manifest.json]",
    );
  }

  const packageResult = applyHumanCandidateSelection({
    review: JSON.parse(readFileSync(resolve(reviewPath), "utf8")),
    decisions: JSON.parse(readFileSync(resolve(decisionsPath), "utf8")),
  });

  writeFileSync(
    resolve(selectionsPath),
    JSON.stringify(packageResult.selections, null, 2) + "\n",
  );

  const manifest = {
    ...packageResult,
    selections: undefined,
  };
  writeFileSync(
    resolve(
      manifestPath ||
        resolve(selectionsPath + ".manifest.json"),
    ),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: packageResult.schema,
      selection_count: packageResult.selection_count,
      human_review_required: true,
      publication_authorized: false,
    }) + "\n",
  );
}
