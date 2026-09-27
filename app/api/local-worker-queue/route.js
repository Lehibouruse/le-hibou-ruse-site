import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getRecord,
  queryRecords,
  TABLES,
  updateRecord,
} from "../../../lib/airtable";
import { buildStoryboardContract, resolveCanonicalVideoProfile } from "../../../scripts/video-airtable-sync.mjs";
import { validateReuseLineage } from "../../../scripts/video-job-lineage.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNTIME_COMMIT = /^[0-9a-f]{40}$/i.test(
  String(process.env.VERCEL_GIT_COMMIT_SHA || ""),
)
  ? String(process.env.VERCEL_GIT_COMMIT_SHA).toLowerCase()
  : null;

const ALLOWED_STATUS = new Set(["Running", "Paused", "Completed", "Error", "Cancelled", "Superseded"]);
const REMOTE_CANCEL_ENABLED =
  String(process.env.HIBOU_VIDEO_REMOTE_CANCEL_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
const REMOTE_REPAIR_RESUME_ENABLED =
  String(process.env.HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
const MAX_BODY_BYTES = 20_000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length > 0
    && left.length === right.length
    && timingSafeEqual(left, right);
}

function authorized(request) {
  const expected = String(process.env.HIBOU_LOCAL_REPORT_TOKEN || "");
  if (!expected) return { ok: false, status: 503, error: "queue_disabled" };

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return safeEqual(auth.slice("Bearer ".length), expected)
    ? { ok: true }
    : { ok: false, status: 401, error: "Unauthorized" };
}

function parseOptions(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function selectName(value) {
  return typeof value === "object" && value
    ? String(value.name || "")
    : String(value || "");
}

function sortPendingRecords(records) {
  const priorityRank = new Map([
    ["High", 0],
    ["Normal", 1],
    ["Low", 2],
  ]);

  return [...records].sort((a, b) => {
    const aPriority = priorityRank.get(
      selectName(a.fields?.["Priorit\u00e9"]),
    ) ?? 99;
    const bPriority = priorityRank.get(
      selectName(b.fields?.["Priorit\u00e9"]),
    ) ?? 99;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aCreated = Date.parse(
      a.fields?.["Cr\u00e9\u00e9 le"] || a.createdTime || "",
    );
    const bCreated = Date.parse(
      b.fields?.["Cr\u00e9\u00e9 le"] || b.createdTime || "",
    );

    const aTime = Number.isFinite(aCreated)
      ? aCreated
      : Number.MAX_SAFE_INTEGER;
    const bTime = Number.isFinite(bCreated)
      ? bCreated
      : Number.MAX_SAFE_INTEGER;

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : item?.id)
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

function cut(value, max = 5000) {
  return String(value ?? "").slice(0, max);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function isHumanSelectionPause(record) {
  const result = parseJsonObject(record?.fields?.["Résultat JSON"]);
  return result.schema === "HIBOU_VIDEO_RENDER_WAITING_HUMAN_SELECTION_V1"
    || result.status === "WAITING_HUMAN_SELECTION";
}

function humanSelectionResumePayload(record) {
  if (!isHumanSelectionPause(record)) {
    return { eligible: false, reason: "not_human_selection_pause" };
  }

  const options = parseOptions(record?.fields?.["Options JSON"]);
  if (options.resume_human_selection !== true) {
    return { eligible: false, reason: "resume_flag_missing" };
  }

  const paused = parseJsonObject(record?.fields?.["Résultat JSON"]);
  const decisions =
    options.human_candidate_decisions &&
    typeof options.human_candidate_decisions === "object" &&
    !Array.isArray(options.human_candidate_decisions)
      ? options.human_candidate_decisions
      : null;

  if (!decisions) {
    return { eligible: false, reason: "human_candidate_decisions_missing" };
  }
  if (decisions.schema !== "HIBOU_HUMAN_IMAGE_SELECTION_V1") {
    return { eligible: false, reason: "human_candidate_decisions_schema_invalid" };
  }

  const pausedFingerprint = String(
    paused.review_fingerprint_sha256 || "",
  ).trim().toLowerCase();
  const decisionFingerprint = String(
    decisions.review_fingerprint_sha256 || "",
  ).trim().toLowerCase();

  if (
    !/^[0-9a-f]{64}$/.test(pausedFingerprint) ||
    decisionFingerprint !== pausedFingerprint
  ) {
    return { eligible: false, reason: "human_selection_fingerprint_mismatch" };
  }

  const contentId = String(paused.content_id || "").trim();
  if (
    !/^rec[A-Za-z0-9]{14}$/.test(contentId) ||
    String(decisions.content_id || "").trim() !== contentId
  ) {
    return { eligible: false, reason: "human_selection_content_mismatch" };
  }

  const decisionRows =
    decisions.decisions &&
    typeof decisions.decisions === "object" &&
    !Array.isArray(decisions.decisions)
      ? decisions.decisions
      : null;
  const entries = decisionRows ? Object.entries(decisionRows) : [];
  if (!entries.length || entries.length > 25) {
    return { eligible: false, reason: "human_selection_decisions_invalid" };
  }

  const normalizedRows = {};
  for (const [sceneId, decision] of entries) {
    const normalizedSceneId = String(sceneId).trim();
    const candidateId = cut(decision?.candidate_id || "", 120).trim();
    if (
      !/^S[0-9A-Za-z_-]{1,30}$/.test(normalizedSceneId) ||
      !decision ||
      typeof decision !== "object" ||
      Array.isArray(decision) ||
      !candidateId ||
      decision.human_confirmed !== true
    ) {
      return { eligible: false, reason: "human_selection_decision_row_invalid" };
    }
    normalizedRows[normalizedSceneId] = {
      candidate_id: candidateId,
      human_confirmed: true,
      note: cut(decision.note || "", 1000) || null,
    };
  }

  const normalizedDecisions = {
    schema: "HIBOU_HUMAN_IMAGE_SELECTION_V1",
    content_id: contentId,
    review_fingerprint_sha256: pausedFingerprint,
    decisions: normalizedRows,
    publication_authorized: false,
  };

  return {
    eligible: true,
    reason: "human_selection_ready",
    content_id: contentId,
    review_fingerprint_sha256: pausedFingerprint,
    decisions: normalizedDecisions,
    normalized_options: {
      ...options,
      resume_human_selection: true,
      human_candidate_decisions: normalizedDecisions,
    },
  };
}

function repairResumePayload(record) {
  const diagnostic = parseJsonObject(record?.fields?.["Résultat JSON"]);
  if (diagnostic.schema !== "HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1") {
    return { eligible: false, reason: "failure_diagnostic_required" };
  }
  if (diagnostic.resume_execution_performed === true) {
    return { eligible: false, reason: "resume_already_executed" };
  }

  const options = parseOptions(record?.fields?.["Options JSON"]);
  if (options.resume_failed_job !== true) {
    return { eligible: false, reason: "resume_failed_job_flag_missing" };
  }
  if (options.human_confirmed_resume !== true) {
    return { eligible: false, reason: "human_resume_confirmation_missing" };
  }

  const reportedPlanSha = String(
    diagnostic.resume_plan_sha256 || "",
  ).trim().toLowerCase();
  const requestedPlanSha = String(
    options.resume_plan_sha256 || "",
  ).trim().toLowerCase();
  if (
    !/^[0-9a-f]{64}$/.test(reportedPlanSha) ||
    requestedPlanSha !== reportedPlanSha
  ) {
    return { eligible: false, reason: "repair_resume_plan_sha_mismatch" };
  }

  const reportedStateSha = String(
    diagnostic.resume_plan?.source_state_sha256 || "",
  ).trim().toLowerCase();
  const requestedStateSha = String(
    options.resume_source_state_sha256 || "",
  ).trim().toLowerCase();
  if (
    !/^[0-9a-f]{64}$/.test(reportedStateSha) ||
    requestedStateSha !== reportedStateSha
  ) {
    return { eligible: false, reason: "repair_resume_state_sha_mismatch" };
  }

  if (diagnostic.resume_plan?.resume_required !== true) {
    return { eligible: false, reason: "repair_resume_not_required" };
  }
  const resumeStage = cut(
    diagnostic.resume_plan?.resume_stage || "",
    80,
  ).trim();
  if (!resumeStage) {
    return { eligible: false, reason: "repair_resume_stage_missing" };
  }

  const contentId = String(diagnostic.content_id || "").trim();
  if (
    !/^rec[A-Za-z0-9]{14}$/.test(contentId) ||
    String(options.content_id || "").trim() !== contentId
  ) {
    return { eligible: false, reason: "repair_resume_content_mismatch" };
  }

  const request = {
    schema: "HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1",
    content_id: contentId,
    resume_plan_sha256: reportedPlanSha,
    source_state_sha256: reportedStateSha,
    resume_stage: resumeStage,
    human_confirmed: true,
    publication_authorized: false,
  };

  return {
    eligible: true,
    reason: "repair_resume_ready",
    content_id: contentId,
    request,
    normalized_options: {
      ...options,
      resume_failed_job: false,
      human_confirmed_resume: false,
      repair_resume_request: request,
    },
  };
}

async function autoResumeFailedRepair(request) {
  if (!REMOTE_REPAIR_RESUME_ENABLED) {
    return { resumed: false, reason: "remote_repair_resume_disabled" };
  }

  const { session, worker } = workerSession(request);
  if (!session || !worker) {
    return { resumed: false, reason: "worker_session_required" };
  }

  const active = await activeVideoJobs();
  if (active.length) {
    return {
      resumed: false,
      reason: "queue_not_empty",
      active_job_ids: active.map((record) => record.id),
    };
  }

  const errored = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND({Statut}='Error',{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });

  const eligible = errored
    .map((record) => ({ record, repair: repairResumePayload(record) }))
    .filter((item) => item.repair.eligible);

  if (eligible.length !== 1) {
    return {
      resumed: false,
      reason: eligible.length
        ? "ambiguous_repair_resume_jobs"
        : "no_repair_resume_job",
      eligible_job_ids: eligible.map((item) => item.record.id),
    };
  }

  const { record, repair } = eligible[0];
  const resumedAt = new Date().toISOString();
  await updateRecord(TABLES.localWorkerQueue, record.id, {
    Statut: "Pending",
    "Options JSON": JSON.stringify(repair.normalized_options),
    "Résultat JSON": JSON.stringify({
      schema: "HIBOU_VIDEO_RENDER_REPAIR_RESUME_SCHEDULED_V1",
      status: "REPAIR_RESUME_SCHEDULED",
      resumed_at: resumedAt,
      resumed_by_worker: worker,
      resumed_by_session: session,
      content_id: repair.content_id,
      resume_plan_sha256: repair.request.resume_plan_sha256,
      source_state_sha256: repair.request.source_state_sha256,
      resume_stage: repair.request.resume_stage,
      human_confirmed: true,
      human_review_required: true,
      publication_authorized: false,
      paid_fallback: false,
    }),
  });

  return {
    resumed: true,
    job_id: record.id,
    resumed_at: resumedAt,
    resume_stage: repair.request.resume_stage,
    resume_plan_sha256: repair.request.resume_plan_sha256,
  };
}

async function autoResumeHumanSelection(request) {
  const { session, worker } = workerSession(request);
  if (!session || !worker) {
    return { resumed: false, reason: "worker_session_required" };
  }

  const active = await activeVideoJobs();
  if (active.length) {
    return {
      resumed: false,
      reason: "queue_not_empty",
      active_job_ids: active.map((record) => record.id),
    };
  }

  const paused = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND({Statut}='Paused',{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });

  const eligible = paused
    .map((record) => ({ record, decision: humanSelectionResumePayload(record) }))
    .filter((item) => item.decision.eligible);

  if (eligible.length !== 1) {
    return {
      resumed: false,
      reason: eligible.length
        ? "ambiguous_human_selection_resume_jobs"
        : "no_human_selection_resume_job",
      eligible_job_ids: eligible.map((item) => item.record.id),
    };
  }

  const { record, decision } = eligible[0];
  const resumedAt = new Date().toISOString();
  await updateRecord(TABLES.localWorkerQueue, record.id, {
    Statut: "Pending",
    "Options JSON": JSON.stringify(decision.normalized_options),
    "Résultat JSON": JSON.stringify({
      schema: "HIBOU_VIDEO_RENDER_HUMAN_SELECTION_RESUME_V1",
      status: "HUMAN_SELECTION_RESUME_SCHEDULED",
      resumed_at: resumedAt,
      resumed_by_worker: worker,
      resumed_by_session: session,
      content_id: decision.content_id,
      review_fingerprint_sha256: decision.review_fingerprint_sha256,
      human_review_required: true,
      publication_authorized: false,
      paid_fallback: false,
    }),
  });

  return {
    resumed: true,
    job_id: record.id,
    resumed_at: resumedAt,
    review_fingerprint_sha256: decision.review_fingerprint_sha256,
  };
}

function reuseValidationReason(error) {
  const message = cut(error?.message || error, 1000);
  return /^reuse_[a-z0-9_]+$/i.test(message)
    ? message
    : "reuse_parent_lookup_failed: " + message;
}

async function activeVideoJobs() {
  const requests = [
    queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Pending',{Type}='VIDEO_RENDER')",
      pageSize: 10,
    }),
    queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Running',{Type}='VIDEO_RENDER')",
      pageSize: 10,
    }),
  ];
  if (REMOTE_CANCEL_ENABLED) {
    requests.push(queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND(OR({Statut}='Cancel requested',{Statut}='Supersede requested'),{Type}='VIDEO_RENDER')",
      pageSize: 10,
    }));
  }
  const groups = await Promise.all(requests);
  return groups.flat();
}

async function videoControls() {
  if (!REMOTE_CANCEL_ENABLED) return [];
  const records = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND(OR({Statut}='Running',{Statut}='Cancel requested',{Statut}='Supersede requested'),{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });
  const controls = [];
  for (const record of records) {
    const status = selectName(record.fields?.Statut);
    const options = parseOptions(record.fields?.["Options JSON"]);
    const controlState = String(options.control_state || "").toLowerCase();
    let state = null;
    if (status === "Cancel requested" || controlState === "cancel_requested") {
      state = "cancel_requested";
    } else if (status === "Supersede requested" || controlState === "supersede_requested") {
      state = "supersede_requested";
    }
    if (!state) continue;
    const heartbeat = parseJsonObject(record.fields?.["Résultat JSON"]);
    controls.push({
      schema: "HIBOU_VIDEO_RENDER_CONTROL_V1",
      job_id: record.id,
      state,
      request_id: cut(options.control_request_id || `${record.id}:${state}`, 240),
      requested_at: cut(options.control_requested_at || "", 80) || null,
      reason: cut(options.control_reason || "", 1000),
      superseded_by: cut(options.superseded_by || "", 120) || null,
      expected_worker: cut(heartbeat.worker || record.fields?.Worker || "", 180),
      expected_worker_session: cut(heartbeat.worker_session || "", 240),
      publication_authorized: false,
    });
  }
  return controls;
}

function workerSession(request) {
  return {
    session: cut(request.headers.get("x-hibou-worker-session"), 240),
    worker: cut(request.headers.get("x-hibou-worker"), 180),
  };
}

function isTransientVideoError(error) {
  const message = String(error || "");
  const transientPatterns = [
    /\btimeout\b/i,
    /timed out/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /EAI_AGAIN/i,
    /fetch failed/i,
    /socket hang up/i,
    /HTTP 5\d\d/i,
    /terminated by signal/i,
    /CUDA out of memory/i,
    /cublas[^\n]*alloc/i,
    /orphaned_worker_timeout/i,
    /worker[^\n]*(?:crash|stopp|offline|unavailable)/i,
    /ComfyUI[^\n]*(?:timeout|unavailable|connection|refused)/i,
  ];
  return transientPatterns.some((pattern) => pattern.test(message));
}

function retryDecision(current, reportedStatus, error) {
  if (reportedStatus !== "Error") {
    return { retry: false, reason: "status_not_error" };
  }

  const options = parseOptions(current.fields?.["Options JSON"]);
  if (options.auto_retry_transient_errors !== true) {
    return { retry: false, reason: "auto_retry_disabled" };
  }

  if (!isTransientVideoError(error)) {
    return { retry: false, reason: "error_not_transient" };
  }

  const limit = Math.max(
    0,
    Math.min(2, Number(options.auto_retry_limit || 0)),
  );
  const attempts = Number(current.fields?.Tentatives || 0);

  if (attempts <= 0) {
    return { retry: false, reason: "attempt_count_missing", attempts, limit };
  }

  if (attempts > limit) {
    return { retry: false, reason: "retry_limit_reached", attempts, limit };
  }

  return {
    retry: true,
    reason: "transient_error_retry_scheduled",
    attempts,
    limit,
    local_backoff_seconds: 60,
  };
}

async function autoActivateWhenWorkerReady(request) {
  const { session, worker } = workerSession(request);
  if (!session || !worker) {
    return { activated: false, reason: "worker_session_required" };
  }

  const active = await activeVideoJobs();
  if (active.length) {
    return {
      activated: false,
      reason: "queue_not_empty",
      active_job_ids: active.map((record) => record.id),
    };
  }

  const paused = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND({Statut}='Paused',{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });

  const eligible = paused.filter((record) => {
    if (isHumanSelectionPause(record)) return false;
    const options = parseOptions(record.fields?.["Options JSON"]);
    return options.auto_start_when_worker_ready === true;
  });

  if (eligible.length !== 1) {
    return {
      activated: false,
      reason: eligible.length ? "ambiguous_auto_start_jobs" : "no_auto_start_job",
      eligible_job_ids: eligible.map((record) => record.id),
    };
  }

  const record = eligible[0];
  const activatedAt = new Date().toISOString();
  await updateRecord(TABLES.localWorkerQueue, record.id, {
    Statut: "Pending",
    "R\u00e9sultat JSON": JSON.stringify({
      schema: "HIBOU_VIDEO_RENDER_AUTO_ACTIVATION_V1",
      activated_at: activatedAt,
      activated_by_worker: worker,
      activated_by_session: session,
      reason: "worker_ready_and_queue_empty",
      publication_authorized: false,
      paid_fallback: false,
    }),
  });

  return {
    activated: true,
    job_id: record.id,
    activated_at: activatedAt,
  };
}

async function autoChainAfterSuccess(completedRecordId) {
  const active = await activeVideoJobs();
  if (active.length) {
    return {
      activated: false,
      reason: "queue_not_empty",
      active_job_ids: active.map((record) => record.id),
    };
  }

  const paused = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND({Statut}='Paused',{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });

  const eligible = paused.filter((record) => {
    if (isHumanSelectionPause(record)) return false;
    const options = parseOptions(record.fields?.["Options JSON"]);
    return options.auto_start_after_success === true
      && String(options.auto_start_after_job_id || "") === completedRecordId;
  });

  if (eligible.length !== 1) {
    return {
      activated: false,
      reason: eligible.length ? "ambiguous_success_chain_jobs" : "no_success_chain_job",
      eligible_job_ids: eligible.map((record) => record.id),
    };
  }

  const record = eligible[0];
  const activatedAt = new Date().toISOString();
  await updateRecord(TABLES.localWorkerQueue, record.id, {
    Statut: "Pending",
    "R\u00e9sultat JSON": JSON.stringify({
      schema: "HIBOU_VIDEO_RENDER_SUCCESS_CHAIN_V1",
      activated_at: activatedAt,
      predecessor_job_id: completedRecordId,
      reason: "predecessor_completed",
      publication_authorized: false,
      paid_fallback: false,
    }),
  });

  return {
    activated: true,
    job_id: record.id,
    activated_at: activatedAt,
    predecessor_job_id: completedRecordId,
  };
}

async function markQueueValidationError(record, reason) {
  const now = new Date().toISOString();
  const error = cut(reason, 4000);

  await updateRecord(TABLES.localWorkerQueue, record.id, {
    Statut: "Error",
    "Termin\u00e9 le": now,
    Erreur: "queue_validation_failed: " + error,
    "R\u00e9sultat JSON": JSON.stringify({
      schema: "HIBOU_VIDEO_RENDER_QUEUE_VALIDATION_V1",
      validated_at: now,
      queue_valid: false,
      error,
      publication_authorized: false,
      paid_fallback: false,
    }),
  });

  return {
    job_id: record.id,
    error,
    sanitized_at: now,
  };
}

async function reconcileStaleRunning(request) {
  const session = cut(request.headers.get("x-hibou-worker-session"), 240);
  const worker = cut(request.headers.get("x-hibou-worker"), 180);
  if (!session || !worker) return { checked: 0, reconciled: 0 };

  const running = await queryRecords(TABLES.localWorkerQueue, {
    filterByFormula: "AND({Statut}='Running',{Type}='VIDEO_RENDER')",
    pageSize: 50,
  });

  const nowMs = Date.now();
  const staleAfterMs = 8 * 60 * 1000;
  let reconciled = 0;

  for (const record of running) {
    const fields = record.fields || {};
    const result = parseJsonObject(fields["Résultat JSON"]);
    const heartbeatMs = Date.parse(result.heartbeat_at || "");
    const startedMs = Date.parse(fields["Démarré le"] || "");
    const lastSeenMs = Number.isFinite(heartbeatMs)
      ? heartbeatMs
      : startedMs;

    if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs < staleAfterMs) {
      continue;
    }

    const reconciledAt = new Date().toISOString();
    await updateRecord(TABLES.localWorkerQueue, record.id, {
      Statut: "Error",
      "Terminé le": reconciledAt,
      Erreur: cut(
        `orphaned_worker_timeout: no VIDEO_RENDER heartbeat for more than 8 minutes; reconciled by ${worker}`,
        10000,
      ),
      "Résultat JSON": JSON.stringify({
        schema: "HIBOU_VIDEO_RENDER_ORPHAN_RECONCILIATION_V1",
        reconciled_at: reconciledAt,
        reconciled_by_worker: worker,
        reconciled_by_session: session,
        previous_worker: fields.Worker || null,
        last_seen_at: Number.isFinite(lastSeenMs)
          ? new Date(lastSeenMs).toISOString()
          : null,
        publication_authorized: false,
        paid_fallback: false,
      }),
    });
    reconciled += 1;
  }

  return { checked: running.length, reconciled };
}

export async function GET(request) {
  try {
    const auth = authorized(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      );
    }

    const pollWorker = cut(request.headers.get("x-hibou-worker"), 180);
    const pollSession = cut(request.headers.get("x-hibou-worker-session"), 240);
    const pollBuild = cut(request.headers.get("x-hibou-worker-build"), 180);
    console.info("HIBOU_WORKER_POLL", JSON.stringify({
      worker: pollWorker || null,
      session: pollSession || null,
      build: pollBuild || "legacy",
      runtime_commit: RUNTIME_COMMIT,
    }));

    const reconciliation = await reconcileStaleRunning(request);
    const repair_resume = await autoResumeFailedRepair(request);
    const human_selection_resume = await autoResumeHumanSelection(request);
    const auto_activation = await autoActivateWhenWorkerReady(request);

    const controls = await videoControls();

    const pendingRecords = await queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Pending',{Type}='VIDEO_RENDER')",
      pageSize: 50,
    });
    const records = sortPendingRecords(pendingRecords);

    const jobs = [];
    const queue_sanitization = [];

    for (const record of records) {
      if (jobs.length >= 5) break;
      const options = parseOptions(record.fields?.["Options JSON"]);
      const contentId = String(options.content_id || "").trim();
      const reuseFromJobId = String(options.reuse_from_job_id || "").trim();

      const job = {
        id: record.id,
        airtable_record_id: record.id,
        job_name: String(record.fields?.Job || record.id),
        type: "VIDEO_RENDER",
        label: String(record.fields?.Job || ""),
        options: {
          schema: "HIBOU_VIDEO_RENDER_JOB_V1",
          content_id: contentId,
          max_scenes: Math.max(
            1,
            Math.min(25, Number(options.max_scenes || 20)),
          ),
          regen_attempts: Math.max(
            0,
            Math.min(2, Number(options.regen_attempts || 1)),
          ),
          preview_mode: options.preview_mode === true,
          candidates_per_scene: options.preview_mode === true
            ? 1
            : Math.max(1, Math.min(3, Number(options.candidates_per_scene || 3))),
          reuse_from_job_id: reuseFromJobId || null,
          human_candidate_decisions:
            parseJsonObject(record.fields?.["Résultat JSON"]).schema ===
              "HIBOU_VIDEO_RENDER_HUMAN_SELECTION_RESUME_V1"
              ? (
                  options.human_candidate_decisions &&
                  typeof options.human_candidate_decisions === "object" &&
                  !Array.isArray(options.human_candidate_decisions)
                    ? options.human_candidate_decisions
                    : null
                )
              : null,
          repair_resume_request:
            REMOTE_REPAIR_RESUME_ENABLED &&
            parseJsonObject(record.fields?.["Résultat JSON"]).schema ===
              "HIBOU_VIDEO_RENDER_REPAIR_RESUME_SCHEDULED_V1" &&
            options.repair_resume_request?.schema ===
              "HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1"
              ? options.repair_resume_request
              : null,
          report_airtable: false,
          human_review_required: true,
          publication_authorized: false,
          paid_fallback: false,
        },
        active: true,
        runtime_commit: RUNTIME_COMMIT,
        storyboard: null,
        queue_error: null,
        reuse_lineage: null,
      };

      if (!/^rec[A-Za-z0-9]{14}$/.test(contentId)) {
        const sanitized = await markQueueValidationError(
          record,
          "invalid_content_id",
        );
        queue_sanitization.push(sanitized);
        continue;
      }

      if (
        reuseFromJobId &&
        (
          !/^rec[A-Za-z0-9]{14}$/.test(reuseFromJobId) ||
          reuseFromJobId === record.id
        )
      ) {
        const sanitized = await markQueueValidationError(
          record,
          "invalid_reuse_from_job_id",
        );
        queue_sanitization.push(sanitized);
        continue;
      }

      if (reuseFromJobId) {
        try {
          const ancestorJobIds = [];
          const seen = new Set([record.id]);
          let nextReuseJobId = reuseFromJobId;
          let firstLineage = null;

          while (nextReuseJobId) {
            if (ancestorJobIds.length >= 8) {
              throw new Error("reuse_lineage_too_deep");
            }
            if (seen.has(nextReuseJobId)) {
              throw new Error("reuse_lineage_cycle_detected");
            }

            const parentRecord = await getRecord(
              TABLES.localWorkerQueue,
              nextReuseJobId,
            );
            const lineage = validateReuseLineage({
              current_job_id: record.id,
              current_content_id: contentId,
              reuse_from_job_id: nextReuseJobId,
              parent_record: parentRecord,
            });
            if (!lineage.ok) {
              throw new Error(lineage.reason);
            }

            if (!firstLineage) firstLineage = lineage.lineage;
            ancestorJobIds.push(nextReuseJobId);
            seen.add(nextReuseJobId);
            nextReuseJobId = String(
              lineage.lineage?.grandparent_job_id || "",
            ).trim();
          }

          job.reuse_lineage = {
            ...(firstLineage || {}),
            ancestor_job_ids: ancestorJobIds,
            lineage_depth: ancestorJobIds.length,
            lineage_complete: true,
          };
        } catch (error) {
          const sanitized = await markQueueValidationError(
            record,
            reuseValidationReason(error),
          );
          queue_sanitization.push(sanitized);
          continue;
        }
      }

      try {
        const content = await getRecord(TABLES.content, contentId);
        const sceneIds = linkedIds(
          content.fields?.["Sc\u00e8nes vid\u00e9o"],
        );

        if (!sceneIds.length) {
          throw new Error("Content Pipeline record has no linked video scenes");
        }

        const scenes = [];
        for (const sceneId of sceneIds) {
          scenes.push(await getRecord(TABLES.videoScenes, sceneId));
        }

        const profile = await resolveCanonicalVideoProfile(content);

        job.storyboard = buildStoryboardContract(content, scenes, profile);
        const defaults = job.storyboard?.creative?.production_defaults || {};
        const preview = options.preview_mode === true;
        const defaultCandidates = Math.max(
          1,
          Math.min(3, Number(defaults.candidates_per_scene || 2)),
        );
        const defaultMaxScenes = Math.max(
          1,
          Math.min(25, Number(defaults.plans_max || 16)),
        );

        job.options.max_scenes = Math.max(
          1,
          Math.min(25, Number(options.max_scenes || defaultMaxScenes)),
        );
        job.options.candidates_per_scene = preview
          ? 1
          : Math.max(
              1,
              Math.min(3, Number(options.candidates_per_scene || defaultCandidates)),
            );
        job.options.regen_attempts = preview
          ? 0
          : Math.max(0, Math.min(2, Number(options.regen_attempts || 1)));

        job.storyboard.production = {
          mode: preview ? "preview" : "final",
          candidates_per_scene: job.options.candidates_per_scene,
          regeneration_attempts: job.options.regen_attempts,
          max_scenes: job.options.max_scenes,
          image_qc_threshold: Number(defaults.image_qc_threshold || 85),
          zoom_range_pct: [
            Number(defaults.zoom_min_pct || 1.5),
            Number(defaults.zoom_max_pct || 3.5),
          ],
          full_master_allowed: !preview,
          human_review_required: true,
          publication_authorized: false
        };
        job.storyboard.runtime_commit = RUNTIME_COMMIT;
      } catch (error) {
        const message = cut(error?.message || error, 1000);
        const sanitized = await markQueueValidationError(
          record,
          message,
        );
        queue_sanitization.push(sanitized);
        continue;
      }

      jobs.push(job);
    }

    return NextResponse.json({
      ok: true,
      schema: "HIBOU_VIDEO_RENDER_QUEUE_V2",
      jobs,
      controls,
      remote_cancel_enabled: REMOTE_CANCEL_ENABLED,
      remote_repair_resume_enabled: REMOTE_REPAIR_RESUME_ENABLED,
      runtime_commit: RUNTIME_COMMIT,
      reconciliation,
      repair_resume,
      human_selection_resume,
      auto_activation,
      queue_sanitization,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cut(error?.message || error, 500) },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const auth = authorized(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      );
    }

    const declared = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413 },
      );
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413 },
      );
    }

    const body = JSON.parse(raw);
    const recordId = cut(
      body.airtable_record_id || body.job_id,
      100,
    );
    const status = cut(body.status, 30);

    if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_record_id" },
        { status: 400 },
      );
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "status_not_allowed" },
        { status: 400 },
      );
    }

    if (
      ["Cancelled", "Superseded"].includes(status)
      && !REMOTE_CANCEL_ENABLED
    ) {
      return NextResponse.json(
        { ok: false, error: "remote_cancel_disabled" },
        { status: 409 },
      );
    }

    const current = await getRecord(TABLES.localWorkerQueue, recordId);
    const type = typeof current.fields?.Type === "object"
      ? current.fields.Type?.name
      : current.fields?.Type;

    if (type !== "VIDEO_RENDER") {
      return NextResponse.json(
        { ok: false, error: "job_type_not_allowed" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const retry = retryDecision(current, status, body.error);

    const fields = {
      Statut: retry.retry ? "Pending" : status,
      Worker: cut(body.worker, 180),
      Erreur: cut(body.error, 10000),
    };

    if (retry.retry) {
      fields["R\u00e9sultat JSON"] = JSON.stringify({
        schema: "HIBOU_VIDEO_RENDER_TRANSIENT_RETRY_V1",
        scheduled_at: now,
        reported_status: status,
        retry_reason: retry.reason,
        attempts: retry.attempts,
        retry_limit: retry.limit,
        local_backoff_seconds: retry.local_backoff_seconds,
        last_error: cut(body.error, 12000),
        publication_authorized: false,
        paid_fallback: false,
      });
    }

    if (status === "Running") {
      if (body.heartbeat === true) {
        const heartbeatResult =
          body.result && typeof body.result === "object"
            ? body.result
            : {};
        const rawStageProgress =
          heartbeatResult.stage_progress &&
          typeof heartbeatResult.stage_progress === "object" &&
          !Array.isArray(heartbeatResult.stage_progress)
            ? heartbeatResult.stage_progress
            : null;
        const stageProgress = rawStageProgress
          ? {
              stage: cut(rawStageProgress.stage || "", 80) || null,
              unit: cut(rawStageProgress.unit || "", 80) || null,
              completed_units: Math.max(
                0,
                Math.min(10000, Number(rawStageProgress.completed_units || 0)),
              ),
              failed_units: Math.max(
                0,
                Math.min(10000, Number(rawStageProgress.failed_units || 0)),
              ),
              total_units:
                Number.isFinite(Number(rawStageProgress.total_units)) &&
                Number(rawStageProgress.total_units) >= 0
                  ? Math.min(10000, Number(rawStageProgress.total_units))
                  : null,
              percent:
                Number.isFinite(Number(rawStageProgress.percent))
                  ? Math.max(
                      0,
                      Math.min(100, Number(rawStageProgress.percent)),
                    )
                  : null,
              visual_ready: rawStageProgress.visual_ready === true,
            }
          : null;
        fields["R\u00e9sultat JSON"] = JSON.stringify({
          schema: "HIBOU_VIDEO_RENDER_HEARTBEAT_V1",
          heartbeat_at: now,
          worker: cut(body.worker, 180),
          worker_session: cut(body.worker_session, 240),
          worker_pid: Number(body.worker_pid || 0) || null,
          render_pid: Number(heartbeatResult.render_pid || 0) || null,
          current_stage: cut(heartbeatResult.current_stage || "unknown", 80),
          completed_stages: Array.isArray(heartbeatResult.completed_stages)
            ? heartbeatResult.completed_stages.slice(0, 30).map((x) => cut(x, 80))
            : [],
          failed_stages: Array.isArray(heartbeatResult.failed_stages)
            ? heartbeatResult.failed_stages.slice(0, 30).map((x) => cut(x, 80))
            : [],
          stage_started_at:
            cut(heartbeatResult.stage_started_at || "", 80) || null,
          stage_elapsed_seconds:
            Number.isFinite(Number(heartbeatResult.stage_elapsed_seconds))
              ? Math.max(
                  0,
                  Math.min(
                    7 * 24 * 60 * 60,
                    Number(heartbeatResult.stage_elapsed_seconds),
                  ),
                )
              : null,
          stage_progress: stageProgress,
          stagnation_warning: heartbeatResult.stagnation_warning === true,
          no_progress_seconds:
            Number.isFinite(Number(heartbeatResult.no_progress_seconds))
              ? Math.max(
                  0,
                  Math.min(
                    7 * 24 * 60 * 60,
                    Number(heartbeatResult.no_progress_seconds),
                  ),
                )
              : null,
          stagnation_threshold_seconds:
            Number.isFinite(Number(heartbeatResult.stagnation_threshold_seconds))
              ? Math.max(
                  30,
                  Math.min(
                    24 * 60 * 60,
                    Number(heartbeatResult.stagnation_threshold_seconds),
                  ),
                )
              : null,
          publication_authorized: false,
          paid_fallback: false,
        });
      } else {
        fields["D\u00e9marr\u00e9 le"] = now;
        fields.Tentatives =
          Number(current.fields?.Tentatives || 0) + 1;
      }
    }

    if (
      status === "Completed"
      || status === "Cancelled"
      || status === "Superseded"
      || (status === "Error" && !retry.retry)
    ) {
      fields["Termin\u00e9 le"] = now;
    }

    if (body.local_path) {
      fields["Chemin local"] = cut(body.local_path, 1000);
    }

    if (body.result_sha256) {
      fields["Hash r\u00e9sultat"] = cut(
        body.result_sha256,
        128,
      );
    }

    if (body.result && !retry.retry && body.heartbeat !== true) {
      fields["R\u00e9sultat JSON"] = cut(
        typeof body.result === "string"
          ? body.result
          : JSON.stringify(body.result),
        95000,
      );
    }

    await updateRecord(
      TABLES.localWorkerQueue,
      recordId,
      fields,
    );

    const success_chain = status === "Completed"
      ? await autoChainAfterSuccess(recordId)
      : { activated: false, reason: "predecessor_not_completed" };

    return NextResponse.json({
      ok: true,
      airtable_record_id: recordId,
      reported_status: status,
      status: retry.retry ? "Pending" : status,
      retry,
      success_chain,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cut(error?.message || error, 500) },
      { status: 400 },
    );
  }
}
