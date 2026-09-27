import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getRecord,
  queryRecords,
  TABLES,
  updateRecord,
} from "../../../lib/airtable";
import { buildStoryboardContract } from "../../../scripts/video-airtable-sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNTIME_COMMIT = /^[0-9a-f]{40}$/i.test(
  String(process.env.VERCEL_GIT_COMMIT_SHA || ""),
)
  ? String(process.env.VERCEL_GIT_COMMIT_SHA).toLowerCase()
  : null;

const ALLOWED_STATUS = new Set(["Running", "Completed", "Error"]);
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

async function activeVideoJobs() {
  const [pending, running] = await Promise.all([
    queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Pending',{Type}='VIDEO_RENDER')",
      pageSize: 10,
    }),
    queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Running',{Type}='VIDEO_RENDER')",
      pageSize: 10,
    }),
  ]);
  return [...pending, ...running];
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

function completedArtifactGate(body) {
  const result = body?.result && typeof body.result === "object"
    ? body.result
    : {};
  const schemaOk = result.schema === "HIBOU_VIDEO_RENDER_RESULT_V1";
  const pathValue = String(body?.local_path || result.master_path || "").trim();
  const hashValue = String(body?.result_sha256 || result.master_sha256 || "").trim();
  const bytes = Number(result.master_bytes || 0);
  const pathOk = /master\.mp4$/i.test(pathValue);
  const hashOk = /^[0-9a-f]{64}$/i.test(hashValue);
  const bytesOk = Number.isFinite(bytes) && bytes > 0;
  return {
    ok: schemaOk && pathOk && hashOk && bytesOk,
    schema_ok: schemaOk,
    path_ok: pathOk,
    hash_ok: hashOk,
    bytes_ok: bytesOk,
    master_path: pathOk ? pathValue : null,
    master_sha256: hashOk ? hashValue.toLowerCase() : null,
    master_bytes: bytesOk ? bytes : null,
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

    const reconciliation = await reconcileStaleRunning(request);
    const auto_activation = await autoActivateWhenWorkerReady(request);

    const records = await queryRecords(TABLES.localWorkerQueue, {
      filterByFormula: "AND({Statut}='Pending',{Type}='VIDEO_RENDER')",
      pageSize: 5,
    });

    const jobs = [];

    for (const record of records) {
      const options = parseOptions(record.fields?.["Options JSON"]);
      const contentId = String(options.content_id || "").trim();

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
          report_airtable: false,
          human_review_required: true,
          publication_authorized: false,
          paid_fallback: false,
        },
        active: true,
        runtime_commit: RUNTIME_COMMIT,
        storyboard: null,
        queue_error: null,
      };

      if (!/^rec[A-Za-z0-9]{14}$/.test(contentId)) {
        job.queue_error = "invalid_content_id";
        jobs.push(job);
        continue;
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

        job.storyboard = buildStoryboardContract(content, scenes);
        job.storyboard.runtime_commit = RUNTIME_COMMIT;
      } catch (error) {
        job.queue_error = cut(error?.message || error, 1000);
      }

      jobs.push(job);
    }

    return NextResponse.json({
      ok: true,
      schema: "HIBOU_VIDEO_RENDER_QUEUE_V2",
      jobs,
      runtime_commit: RUNTIME_COMMIT,
      reconciliation,
      auto_activation,
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

    if (body.result && !retry.retry) {
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

    const artifact_gate = status === "Completed"
      ? completedArtifactGate(body)
      : { ok: false, reason: "predecessor_not_completed" };

    const success_chain = status === "Completed" && artifact_gate.ok
      ? await autoChainAfterSuccess(recordId)
      : {
          activated: false,
          reason: status === "Completed"
            ? "completed_artifact_gate_failed"
            : "predecessor_not_completed",
        };

    return NextResponse.json({
      ok: true,
      airtable_record_id: recordId,
      reported_status: status,
      status: retry.retry ? "Pending" : status,
      retry,
      artifact_gate,
      success_chain,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cut(error?.message || error, 500) },
      { status: 400 },
    );
  }
}
