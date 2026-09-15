import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";
import { socialCampaignUrl } from "../../../lib/attribution.mjs";
import { publicationFields } from "../../../lib/social-publication.mjs";
import { fanoutChildSpec, requestedFanoutProviders } from "../../../lib/social-fanout.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEASE_MS = 5 * 60 * 1000;

function parameters(job) {
  try { return JSON.parse(job?.fields?.parameters || "{}"); }
  catch { throw new Error("parameters doit contenir un JSON valide"); }
}

function actionName(job) {
  return job?.fields?.action?.name || job?.fields?.action || "";
}

function selectName(value, fallback = "") {
  return typeof value === "string" ? value : value?.name || fallback;
}

function safeFormula(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function baseUrl(request) {
  const configured = process.env.HIBOU_PUBLIC_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function safeIdempotency(value) {
  const normalized = String(value || "").replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 190);
  return normalized.length >= 8 ? normalized : `hibou-social-${Date.now()}`;
}

async function claim(job) {
  const lockToken = randomUUID();
  const now = new Date();
  await updateRecord(TABLES.jobs, job.id, {
    status: "Running",
    started_at: now.toISOString(),
    completed_at: null,
    error: "",
    lock_token: lockToken,
    lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  const current = await getRecord(TABLES.jobs, job.id);
  const status = current?.fields?.status?.name || current?.fields?.status;
  return current?.fields?.lock_token === lockToken && status === "Running"
    ? { ...current, lockToken }
    : null;
}

async function owns(job) {
  const current = await getRecord(TABLES.jobs, job.id);
  return current?.fields?.lock_token === job.lockToken;
}

async function finish(job, status, result, error = "") {
  if (!(await owns(job))) return false;
  await updateRecord(TABLES.jobs, job.id, {
    status,
    completed_at: ["Completed", "Manual Review", "Error"].includes(status) ? new Date().toISOString() : null,
    result: String(result || "").slice(0, 100000),
    error: String(error || "").slice(0, 5000),
    agent_status: status === "Completed" ? "completed" : status === "Retry" ? "needs_escalation" : "waiting_for_human",
    lock_token: "",
    lease_expires_at: null,
  });
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_SOCIAL_SCHEDULER_V1",
    Déclencheur: job.fields?.requested_by || "Jobs",
    Action: `SCHEDULE_POST · ${job.fields?.job_id || job.id} · ${status}`,
    "Dernière exécution": new Date().toISOString(),
    Erreur: String(error || "").slice(0, 5000),
    Notes: String(result || "").slice(0, 10000),
  }).catch(() => {});
  return true;
}

async function retry(job, message) {
  if (!(await owns(job))) return false;
  const count = Number(job.fields?.retry_count || 0) + 1;
  const max = Math.min(2, Number(job.fields?.max_retries ?? 2));
  if (count > max) return finish(job, "Manual Review", message, message);
  await updateRecord(TABLES.jobs, job.id, {
    status: "Retry",
    retry_count: count,
    next_run_at: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** count)).toISOString(),
    error: String(message).slice(0, 5000),
    agent_status: "needs_escalation",
    lock_token: "",
    lease_expires_at: null,
  });
  return true;
}

async function persistPublication(provider, contentRecordId, data) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(contentRecordId || ""))) return { skipped: true, reason: "content_record_id_absent" };
  const publication = publicationFields(provider, data);
  if (!publication.id) return { skipped: true, reason: publication.reason || "external_id_absent" };
  await updateRecord(TABLES.content, contentRecordId, publication.fields);
  return { skipped: false, id: publication.id, url: publication.url };
}

async function existingChildJob(jobId) {
  const rows = await queryRecords(TABLES.jobs, {
    filterByFormula: `{job_id}='${safeFormula(jobId)}'`,
    pageSize: 1,
    priorityAware: false,
  });
  return rows[0] || null;
}

async function createFanoutChildren(job, params, providers) {
  const parentJobId = String(job.fields?.job_id || job.id);
  const parentIdempotencyKey = safeIdempotency(job.fields?.idempotency_key || params.idempotency_key || `job:${parentJobId}`);
  const created = [];
  const deduplicated = [];

  for (const provider of providers) {
    const fields = fanoutChildSpec({
      parentJobId,
      parentIdempotencyKey,
      provider,
      params,
      requestedBy: job.fields?.requested_by || "Jobs",
      priority: selectName(job.fields?.priority, "Normal"),
      requiresReview: job.fields?.requires_review === true,
      maxRetries: job.fields?.max_retries ?? 2,
    });
    const previous = await existingChildJob(fields.job_id);
    if (previous) {
      deduplicated.push({ provider, job_id: fields.job_id, record_id: previous.id });
      continue;
    }
    const result = await createRecord(TABLES.jobs, fields);
    created.push({ provider, job_id: fields.job_id, record_id: result.records?.[0]?.id || "" });
  }
  return { parent_job_id: parentJobId, providers, created, deduplicated };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const eligible = eligibleJobsFormula(process.env);
    const candidates = await queryRecords(TABLES.jobs, {
      filterByFormula: `AND(${eligible},{action}='SCHEDULE_POST')`,
      sortField: "created_at",
      pageSize: 5,
    });
    const candidate = candidates.find((job) => actionName(job) === "SCHEDULE_POST");
    if (!candidate) return NextResponse.json({ ok: true, processed: 0, reason: "no_schedule_post" });

    const job = await claim(candidate);
    if (!job) return NextResponse.json({ ok: true, processed: 0, reason: "lease_not_acquired" });
    const params = parameters(job);
    const mediaUrl = String(params.media_url || params.video_url || params.url || "").trim();
    const fanoutProviders = requestedFanoutProviders(params);

    if (fanoutProviders.length) {
      if (!mediaUrl) {
        const message = "SCHEDULE_POST fan-out requiert media_url/video_url";
        await finish(job, "Manual Review", message, message);
        return NextResponse.json({ ok: false, processed: 1, status: "waiting_for_human", error: message }, { status: 422 });
      }
      const fanout = await createFanoutChildren(job, params, fanoutProviders);
      const summary = JSON.stringify({ type: "social_fanout", ...fanout });
      await finish(job, "Completed", summary, "");
      return NextResponse.json({ ok: true, processed: 1, status: "completed", fanout });
    }

    const provider = String(params.provider || params.network || job.fields?.target || "").trim().toLowerCase();
    if (!provider || !mediaUrl) {
      const message = "SCHEDULE_POST requiert provider/network et media_url/video_url";
      await finish(job, "Manual Review", message, message);
      return NextResponse.json({ ok: false, processed: 1, status: "waiting_for_human", error: message }, { status: 422 });
    }

    const requestedLive = params.publication_authorization === true || params.publish === true || params.dry_run === false;
    const humanApproved = params.human_approved === true || params.validation_humaine === true;
    const jobId = String(job.fields?.job_id || job.id);
    const idempotencyKey = safeIdempotency(job.fields?.idempotency_key || params.idempotency_key || `job:${jobId}`);
    const campaign = String(params.utm_campaign || params.campaign || params.series || "hibou-organic").trim();
    const contentRecordId = String(params.content_record_id || "").trim();
    const contentId = String(params.utm_content || contentRecordId || params.content_id || params.video_id || jobId).trim();
    const ctaUrl = socialCampaignUrl({ provider, campaign, contentId });
    let caption = String(params.caption || params.text || "");
    if (params.append_site_link === true && !caption.includes("d4d5d6.com")) {
      caption = `${caption.trim()}\n\n${ctaUrl}`.trim();
    }

    const response = await fetch(`${baseUrl(request)}/api/social`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "dispatch",
        provider,
        media_url: mediaUrl,
        caption,
        title: String(params.title || ""),
        privacy_level: String(params.privacy_level || ""),
        dry_run: !requestedLive,
        human_approved: humanApproved,
        idempotency_key: idempotencyKey,
        is_aigc: params.is_aigc !== false,
        metadata: {
          ...(params.metadata || {}),
          job_id: jobId,
          content_record_id: contentRecordId,
          idempotency_key: idempotencyKey,
          cta_url: ctaUrl,
          utm_source: provider,
          utm_medium: "organic_social",
          utm_campaign: campaign,
          utm_content: contentId,
        },
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const message = data.error || `Social gateway ${response.status}`;
      if (response.status >= 500) {
        await retry(job, message);
        return NextResponse.json({ ok: false, processed: 1, status: "retry", error: message }, { status: 503 });
      }
      await finish(job, "Manual Review", message, message);
      return NextResponse.json({ ok: false, processed: 1, status: "waiting_for_human", error: message }, { status: 422 });
    }

    const summaryBase = { provider, requested_live: requestedLive, cta_url: ctaUrl, campaign, content_id: contentId, gateway: data };
    if (requestedLive && data.live_allowed !== true) {
      const summary = JSON.stringify(summaryBase);
      await finish(job, "Manual Review", summary, data.forced_dry_run_reason || "Publication live bloquée par politique");
      return NextResponse.json({ ok: true, processed: 1, status: "waiting_for_human", provider, dry_run: true, cta_url: ctaUrl });
    }

    let persisted = { skipped: true, reason: data.dry_run === true ? "dry_run" : "not_live" };
    if (requestedLive && data.live_allowed === true && data.dry_run !== true) {
      try {
        persisted = await persistPublication(provider, contentRecordId, data);
      } catch (error) {
        const message = `Publié sur ${provider}, mais sauvegarde de l'ID externe impossible: ${String(error?.message || error)}`;
        const summary = JSON.stringify({ ...summaryBase, publication_persistence: { ok: false, error: message } });
        await finish(job, "Manual Review", summary, message);
        return NextResponse.json({ ok: true, processed: 1, status: "waiting_for_human", provider, published: true, persistence_error: message, cta_url: ctaUrl });
      }
    }

    const summary = JSON.stringify({ ...summaryBase, publication_persistence: persisted });
    await finish(job, "Completed", summary, "");
    return NextResponse.json({ ok: true, processed: 1, status: "completed", provider, dry_run: data.dry_run === true, cta_url: ctaUrl, publication: persisted });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500 });
  }
}
