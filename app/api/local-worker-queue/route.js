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

export async function GET(request) {
  try {
    const auth = authorized(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      );
    }

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

    const fields = {
      Statut: status,
      Worker: cut(body.worker, 180),
      Erreur: cut(body.error, 10000),
    };

    if (status === "Running") {
      fields["D\u00e9marr\u00e9 le"] = now;
      fields.Tentatives =
        Number(current.fields?.Tentatives || 0) + 1;
    }

    if (status === "Completed" || status === "Error") {
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

    if (body.result) {
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

    return NextResponse.json({
      ok: true,
      airtable_record_id: recordId,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cut(error?.message || error, 500) },
      { status: 400 },
    );
  }
}
