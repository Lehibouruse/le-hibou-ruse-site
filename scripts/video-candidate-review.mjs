#!/usr/bin/env node
import { createHash } from "node:crypto";
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

function effectivePromptProof(planRequest) {
  const request = planRequest?.request || planRequest?.fallback_request || {};
  const app = request?.prompt_application || {};
  const nodeId = String(app?.prompt_node_id || "");
  const input = String(app?.prompt_input || "");
  const prompt = request?.overrides?.[nodeId]?.[input];
  return {
    compiled_prompt: typeof prompt === "string" ? prompt : null,
    compiled_prompt_sha256: String(app?.compiled_prompt_sha256 || "") || null,
    specific_sha256: String(app?.specific_sha256 || "") || null,
    prompt_binding: nodeId && input ? `${nodeId}.${input}` : null,
  };
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function reviewFingerprint(contentId, scenes) {
  const normalized = {
    content_id: String(contentId || "") || null,
    scenes: asArray(scenes).map((scene) => ({
      scene_id: String(scene?.scene_id || ""),
      machine_recommended_candidate_id:
        String(scene?.machine_recommended_candidate_id || "") || null,
      machine_recommendation_status:
        String(scene?.machine_recommendation_status || "") || null,
      technical_provisional_candidate_id:
        String(scene?.technical_provisional_candidate_id || "") || null,
      machine_recommendation_score_gap:
        Number.isFinite(Number(scene?.machine_recommendation_score_gap))
          ? Number(scene.machine_recommendation_score_gap)
          : null,
      candidates: asArray(scene?.candidates).map((candidate) => ({
        candidate_id: String(candidate?.candidate_id || ""),
        status: String(candidate?.status || ""),
        path: String(candidate?.path || "") || null,
        seed: Number.isFinite(Number(candidate?.seed))
          ? Number(candidate.seed)
          : null,
        request_fingerprint:
          String(candidate?.request_fingerprint || "") || null,
        compiled_prompt_sha256:
          String(candidate?.compiled_prompt_sha256 || "") || null,
        perceptual_score: Number.isFinite(
          Number(candidate?.perceptual_score),
        )
          ? Number(candidate.perceptual_score)
          : null,
      })),
    })),
  };
  return sha256Text(JSON.stringify(normalized));
}

export function buildCandidateDecisionTemplate(review) {
  if (review?.schema !== CANDIDATE_REVIEW_SCHEMA) {
    fail("HIBOU_CANDIDATE_REVIEW_V1 required for decision template");
  }
  const decisions = {};
  for (const scene of asArray(review.scenes)) {
    if (!scene?.reviewable) continue;
    decisions[String(scene.scene_id)] = {
      candidate_id: null,
      human_confirmed: false,
      note: null,
    };
  }
  return {
    schema: "HIBOU_HUMAN_IMAGE_SELECTION_V1",
    content_id: review.content_id || null,
    prompt_contract_ref: review.prompt_contract_ref ? structuredClone(review.prompt_contract_ref) : null,
    review_fingerprint_sha256:
      String(review.review_fingerprint_sha256 || "") || null,
    decisions,
    policy: {
      human_must_choose_each_reviewable_scene: true,
      human_confirmed_must_be_true: true,
      stale_review_fingerprint_rejected: true,
      publication_authorized: false,
    },
    publication_authorized: false,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function imageHref(path) {
  if (!path) return "";
  try {
    return pathToFileURL(resolve(path)).href;
  } catch {
    return "";
  }
}

export function renderCandidateReviewHtml(review) {
  if (review?.schema !== CANDIDATE_REVIEW_SCHEMA) {
    fail("HIBOU_CANDIDATE_REVIEW_V1 required for HTML");
  }

  const sceneBlocks = asArray(review.scenes).map((scene) => {
    const effectivePrompt = asArray(scene.candidates).find(candidate => candidate?.effective_prompt)?.effective_prompt || "";
    const compiledPromptSha = asArray(scene.candidates).find(candidate => candidate?.compiled_prompt_sha256)?.compiled_prompt_sha256 || "";
    const cards = asArray(scene.candidates).map((candidate) => {
      const recommended =
        candidate.candidate_id === scene.machine_recommended_candidate_id;
      const warnings = asArray(candidate.warnings).join(", ") || "—";
      const reasons = asArray(candidate.reasons).join(", ") || "—";
      const href = imageHref(candidate.path);
      return `
        <article class="candidate">
          <div class="candidate-head">
            <strong>${escapeHtml(candidate.candidate_id)}</strong>
            <span>${escapeHtml(candidate.status)}</span>
            ${recommended ? '<span class="recommended">recommandation machine</span>' : ""}
          </div>
          ${href ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(candidate.candidate_id)}">` : '<div class="missing">Image indisponible</div>'}
          <dl>
            <dt>Score perceptuel</dt><dd>${escapeHtml(candidate.perceptual_score ?? "—")}</dd>
            <dt>Warnings</dt><dd>${escapeHtml(warnings)}</dd>
            <dt>Rejets</dt><dd>${escapeHtml(reasons)}</dd>
            <dt>Seed</dt><dd>${escapeHtml(candidate.seed ?? "—")}</dd>
          </dl>
        </article>`;
    }).join("\n");

    return `
      <section class="scene">
        <h2>${escapeHtml(scene.scene_id)}</h2>
        <p>Recommandation machine : <strong>${escapeHtml(
          scene.machine_recommendation_status === "AMBIGUOUS"
            ? "ambiguë — aucun choix machine"
            : (scene.machine_recommended_candidate_id || "aucune"),
        )}</strong> · Sélection technique provisoire : <strong>${escapeHtml(scene.technical_provisional_candidate_id || "aucune")}</strong> · Décision humaine : <strong>EN ATTENTE</strong></p>
        ${effectivePrompt ? `<details class="prompt-proof"><summary>Brief effectif envoyé à ComfyUI</summary><p><strong>SHA-256 :</strong> ${escapeHtml(compiledPromptSha || "—")}</p><pre>${escapeHtml(effectivePrompt)}</pre></details>` : ""}
        <div class="grid">${cards}</div>
      </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Le Hibou Rusé — revue candidats images</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:24px;background:#f7f4ec;color:#172331}
header{max-width:1100px;margin:auto auto 24px}
.scene{max-width:1100px;margin:0 auto 36px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.candidate{background:white;border:1px solid #d8d2c3;border-radius:14px;padding:12px}
.candidate img{width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:10px;background:#eee}
.candidate-head{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.recommended{background:#e8dfb8;padding:2px 7px;border-radius:999px;font-size:12px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:5px 10px;font-size:13px}
dt{font-weight:700} dd{margin:0}.missing{aspect-ratio:9/16;display:grid;place-items:center;background:#eee;border-radius:10px}
.notice{padding:12px 14px;background:#fff6cf;border-radius:10px}
.prompt-proof{margin:12px 0 16px;background:#eef3f8;border:1px solid #c9d6e2;border-radius:10px;padding:10px 12px}
.prompt-proof pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:280px;overflow:auto}
</style>
</head>
<body>
<header>
<h1>Revue des candidats images</h1>
<p class="notice">Le ranking est uniquement consultatif. Aucun candidat n’est approuvé automatiquement. La sélection finale reste humaine.</p>
<p>Contenu : ${escapeHtml(review.content_id || "—")} · Scènes : ${escapeHtml(review.scene_count)} · Blocages : ${escapeHtml(review.blocking_scene_count)}</p>
</header>
${sceneBlocks}
</body>
</html>\n`;
}

export function buildCandidateReview({
  plan,
  perceptualQc,
  provisionalSelections = {},
  recommendationMinScoreGap = 2,
} = {}) {
  if (plan?.schema !== "HIBOU_IMAGE_PLAN_V1") {
    fail("HIBOU_IMAGE_PLAN_V1 required");
  }
  if (perceptualQc?.schema !== "HIBOU_IMAGE_PERCEPTUAL_QC_V1") {
    fail("HIBOU_IMAGE_PERCEPTUAL_QC_V1 required");
  }
  if(plan?.prompt_contract_ref?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
    fail("candidate review requires strict prompt_contract_ref V2");
  }

  const requests = byCandidate(plan);
  const scenes = new Map();

  for (const row of asArray(perceptualQc.rows)) {
    const sceneId = String(row?.scene_id || "").trim();
    const candidateId = String(row?.candidate_id || "").trim();
    if (!sceneId || !candidateId) continue;

    const request = requests.get(candidateId) || {};
    const promptProof = effectivePromptProof(request);
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
      effective_prompt: promptProof.compiled_prompt,
      compiled_prompt_sha256: promptProof.compiled_prompt_sha256,
      specific_sha256: promptProof.specific_sha256,
      prompt_binding: promptProof.prompt_binding,
      prompt_contract_ref: structuredClone(
        request?.request?.prompt_contract_ref ||
        request?.fallback_request?.prompt_contract_ref ||
        null
      ),
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
    const reviewable = passing.length > 0;
    const top = passing[0] || null;
    const second = passing[1] || null;
    const topScore = Number.isFinite(Number(top?.perceptual_score))
      ? Number(top.perceptual_score)
      : null;
    const secondScore = Number.isFinite(Number(second?.perceptual_score))
      ? Number(second.perceptual_score)
      : null;
    const scoreGap =
      topScore != null && secondScore != null
        ? topScore - secondScore
        : null;
    const minGap = Math.max(0, Number(recommendationMinScoreGap) || 0);

    let machineRecommended = null;
    let recommendationStatus = "NONE";
    let recommendationReason = "no_passing_candidate";

    if (passing.length === 1) {
      machineRecommended = top.candidate_id;
      recommendationStatus = "RECOMMENDED";
      recommendationReason = "single_passing_candidate";
    } else if (passing.length > 1) {
      if (scoreGap != null && scoreGap > minGap) {
        machineRecommended = top.candidate_id;
        recommendationStatus = "RECOMMENDED";
        recommendationReason = "clear_perceptual_score_gap";
      } else {
        recommendationStatus = "AMBIGUOUS";
        recommendationReason =
          scoreGap == null
            ? "score_gap_unavailable"
            : "top_candidates_within_score_gap";
      }
    }

    if (!reviewable) blockingSceneCount += 1;

    outputScenes.push({
      scene_id: sceneId,
      technical_provisional_candidate_id: provisionalId,
      machine_recommended_candidate_id: machineRecommended,
      machine_recommendation_status: recommendationStatus,
      machine_recommendation_reason: recommendationReason,
      machine_recommendation_score_gap: scoreGap,
      machine_recommendation_min_score_gap: minGap,
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

  const contentId =
    String(plan?.content_id || perceptualQc?.content_id || "") || null;
  const reviewFingerprintSha256 = reviewFingerprint(contentId, outputScenes);

  return {
    schema: CANDIDATE_REVIEW_SCHEMA,
    content_id: contentId,
    prompt_contract_ref: structuredClone(plan.prompt_contract_ref),
    review_fingerprint_sha256: reviewFingerprintSha256,
    scene_count: outputScenes.length,
    blocking_scene_count: blockingSceneCount,
    all_scenes_reviewable: blockingSceneCount === 0,
    scenes: outputScenes,
    policy: {
      machine_ranking_is_advisory_only: true,
      ambiguous_top_scores_produce_no_machine_recommendation: true,
      recommendation_min_score_gap: Math.max(
        0,
        Number(recommendationMinScoreGap) || 0,
      ),
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
  const [planPath, perceptualPath, provisionalPath, outputPath, htmlPath] =
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
  const templatePath = resolve(
    resolve(outputPath).replace(/\.json$/i, "") + ".decisions.template.json",
  );
  writeFileSync(
    templatePath,
    JSON.stringify(buildCandidateDecisionTemplate(review), null, 2) + "\n",
  );
  if (htmlPath) {
    writeFileSync(resolve(htmlPath), renderCandidateReviewHtml(review));
  }
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
