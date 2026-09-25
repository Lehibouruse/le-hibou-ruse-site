import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { bearerSecretAuthorized } from "../../../lib/admin-auth.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../../../lib/social-gateway-complete.mjs";
import { dispatchSocialWebhookFallback, safeDirectFallbackError } from "../../../lib/social-fallback.mjs";
import { resolveSocialEnv, socialGatewayStatusWithVault } from "../../../lib/social-credentials-runtime.mjs";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../../../lib/social-runtime.mjs";
import { socialDispatchJournalOutcome } from "../../../lib/tiktok-dispatch-confirmation.mjs";
import { fetchTikTokPublishStatus, pollTikTokPublishStatus } from "../../../lib/tiktok-publish-status.mjs";

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
  if (bearerSecretAuthorized(request, process.env.CRON_SECRET)) return { kind: "cron" };
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

async function tiktokPublicationStatus(body, env) {
  const publishId = String(body.publish_id || body.external_id || "").trim();
  if (!publishId) return NextResponse.json({ ok: false, error: "publish_id TikTok requis" }, { status: 400 });
  const resolved = await resolveSocialEnv("tiktok", env);
  const token = String(resolved.env?.TIKTOK_ACCESS_TOKEN || "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "TikTok OAuth direct non connecté" }, { status: 409 });
  const shouldWait = body.wait === true;
  const status = shouldWait
    ? await pollTikTokPublishStatus(publishId, token, {
      attempts: Math.max(1, Math.min(15, Number(body.attempts || 8))),
      intervalMs: Math.max(500, Math.min(5000, Number(body.interval_ms || 2000))),
    })
    : await fetchTikTokPublishStatus(publishId, token);
  return NextResponse.json({
    ok: true,
    provider: "tiktok",
    credential_source: resolved.source,
    ...status,
  }, { headers: { "Cache-Control": "no-store" } });
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

    if (body.operation === "publication_status") {
      const provider = String(body.provider || "").trim().toLowerCase();
      if (provider !== "tiktok") {
        return NextResponse.json({ ok: false, error: "publication_status est actuellement implémenté pour TikTok" }, { status: 400 });
      }
      return tiktokPublicationStatus(body, env);
    }

    if (body.operation !== "dispatch") {
      return NextResponse.json({ ok: false, error: "operation doit être status, publication_status ou dispatch" }, { status: 400 });
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
          retry_policy: "do_not_redispatch_check_previous_state",
          message: "Dispatch déjà tenté avec cette clé; aucune republication automatique.",
        });
      }
      intent = await createDispatchIntent(body.provider, idempotencyKey, identity, body);
    }

    const resolved = await resolveSocialEnv(body.provider, env);
    const dispatchInput = {
      ...body,
      dry_run: !liveAllowed,
    };
    const provider = String(body.provider || "").toLowerCase();
    const gatewayPlan = socialGatewayStatus(resolved.env).find((item) => item.provider === provider);
    let result;
    let fallbackUsed = false;
    try {
      result = await dispatchSocialPost(dispatchInput, resolved.env);
    } catch (directError) {
      const safeFallback = liveAllowed
        && gatewayPlan?.mode === "direct"
        && gatewayPlan?.webhook_configured === true
        && safeDirectFallbackError(directError);
      if (!safeFallback) throw directError;
      result = await dispatchSocialWebhookFallback(body.provider, dispatchInput, resolved.env);
      fallbackUsed = true;
    }

    const outcome = liveAllowed
      ? socialDispatchJournalOutcome(provider, result, { fallbackUsed })
      : { state: "dry_run", action: `${provider} · dry run`, error: "", retry_policy: "not_applicable" };

    if (intent) {
      await updateDispatchIntent(intent, {
        Action: outcome.action,
        Erreur: outcome.error,
        Notes: JSON.stringify({
          state: outcome.state,
          provider,
          idempotency_key: idempotencyKey,
          credential_source: resolved.source,
          fallback_used: fallbackUsed,
          retry_policy: outcome.retry_policy,
          publish_id: String(result?.publish_id || result?.result?.publish_id || ""),
          publication_status: String(result?.publication_status || ""),
          result,
          completed_at: new Date().toISOString(),
        }).slice(0, 100000),
      });
    }

    return NextResponse.json({
      ...result,
      ok: outcome.state === "publication_failed" ? false : result?.ok !== false,
      dispatch_state: outcome.state,
      retry_policy: outcome.retry_policy,
      credential_source: resolved.source,
      fallback_used: fallbackUsed,
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
