import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { dispatchSocialPost } from "../../../lib/social-gateway.mjs";
import { resolveSocialEnv, socialGatewayStatusWithVault } from "../../../lib/social-credentials-runtime.mjs";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFormula(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function validIdempotencyKey(value) {
  return /^[A-Za-z0-9._:-]{8,200}$/.test(String(value || ""));
}

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { kind: "cron" };
  await verifyGithubActionsToken(token);
  return { kind: "github_oidc" };
}

async function runtimeConfiguration() {
  const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
  const config = configurationMap(records);
  return {
    config,
    policy: socialPolicy(config),
    env: socialRuntimeEnv(config),
  };
}

function dispatchExternalKey(provider, idempotencyKey) {
  return `social:${String(provider || "").toLowerCase()}:${idempotencyKey}`;
}

async function previousDispatch(provider, idempotencyKey) {
  const externalKey = dispatchExternalKey(provider, idempotencyKey);
  const records = await queryRecords(TABLES.journal, {
    filterByFormula: `{ID externe}='${safeFormula(externalKey)}'`,
    pageSize: 1,
  });
  return records[0] || null;
}

async function createDispatchIntent(provider, idempotencyKey, identity, body) {
  const externalKey = dispatchExternalKey(provider, idempotencyKey);
  const created = await createRecord(TABLES.journal, {
    Workflow: "HIBOU_SOCIAL_GATEWAY_V1",
    Déclencheur: identity.kind,
    Action: `${provider} · dispatch intent`,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": externalKey,
    Erreur: "",
    Notes: JSON.stringify({
      state: "intent_recorded",
      provider,
      idempotency_key: idempotencyKey,
      media_url: String(body.media_url || "").slice(0, 1000),
      created_at: new Date().toISOString(),
    }),
  });
  return { recordId: created.records?.[0]?.id || "", externalKey };
}

async function updateDispatchIntent(intent, fields) {
  if (!intent?.recordId) return;
  await updateRecord(TABLES.journal, intent.recordId, {
    "Dernière exécution": new Date().toISOString(),
    ...fields,
  });
}

export async function POST(request) {
  let intent = null;
  try {
    const identity = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const runtimeConfig = await runtimeConfiguration();
    const { policy, env } = runtimeConfig;

    if (body.operation === "status") {
      return NextResponse.json({
        ok: true,
        authenticated_via: identity.kind,
        policy,
        providers: await socialGatewayStatusWithVault(env),
      });
    }

    if (body.operation !== "dispatch") {
      return NextResponse.json({ ok: false, error: "operation doit être status ou dispatch" }, { status: 400 });
    }
    if (!policy.gateway_enabled) {
      return NextResponse.json({ ok: false, error: "Passerelle sociale désactivée par kill switch" }, { status: 423 });
    }

    const humanApproved = body.human_approved === true;
    const requestedLive = body.dry_run === false;
    const liveAllowed = requestedLive
      && !policy.test_mode
      && (!policy.review_required || humanApproved);

    let idempotencyKey = "";
    if (liveAllowed) {
      idempotencyKey = String(body.idempotency_key || body.metadata?.idempotency_key || "");
      if (!validIdempotencyKey(idempotencyKey)) {
        return NextResponse.json({ ok: false, error: "idempotency_key live requis (8-200 caractères alphanumériques/._:-)" }, { status: 400 });
      }
      const previous = await previousDispatch(body.provider, idempotencyKey);
      if (previous) {
        return NextResponse.json({
          ok: true,
          deduplicated: true,
          provider: String(body.provider || "").toLowerCase(),
          idempotency_key: idempotencyKey,
          previous_record_id: previous.id,
          policy,
          live_requested: true,
          live_allowed: true,
          message: "Dispatch déjà tenté avec cette clé; aucune republication automatique.",
        });
      }
      intent = await createDispatchIntent(body.provider, idempotencyKey, identity, body);
    }

    const resolved = await resolveSocialEnv(body.provider, env);
    const result = await dispatchSocialPost({
      ...body,
      dry_run: !liveAllowed,
    }, resolved.env);

    if (intent) {
      await updateDispatchIntent(intent, {
        Action: `${String(body.provider || "").toLowerCase()} · dispatched`,
        Erreur: "",
        Notes: JSON.stringify({
          state: "dispatched",
          provider: String(body.provider || "").toLowerCase(),
          idempotency_key: idempotencyKey,
          credential_source: resolved.source,
          result,
          completed_at: new Date().toISOString(),
        }).slice(0, 100000),
      });
    }

    return NextResponse.json({
      ...result,
      credential_source: resolved.source,
      policy,
      idempotency_key: idempotencyKey,
      live_requested: requestedLive,
      live_allowed: liveAllowed,
      forced_dry_run_reason: liveAllowed
        ? ""
        : policy.test_mode
          ? "social_test_mode"
          : policy.review_required && !humanApproved
            ? "human_review_required"
            : "dry_run_requested",
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    if (intent) {
      await updateDispatchIntent(intent, {
        Action: "social · ambiguous_or_failed",
        Erreur: message,
        Notes: JSON.stringify({ state: "ambiguous_or_failed", error: message, failed_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message, retry_policy: intent ? "new_idempotency_key_after_manual_check" : "safe_to_retry" }, { status });
  }
}
