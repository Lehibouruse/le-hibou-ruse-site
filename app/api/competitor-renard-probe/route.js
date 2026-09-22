import { NextResponse } from "next/server";
import { resolveSocialEnv } from "../../../lib/social-credentials-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET = "renard_finance";

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { text: text.slice(0, 1200) }; }
}

function safeError(label, response, data) {
  return {
    label,
    status: response.status,
    error: data?.error?.message || data?.error?.type || data?.error?.code || data?.text || response.statusText || "unknown",
    code: data?.error?.code || null,
    subcode: data?.error?.error_subcode || null,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("target") !== TARGET) {
    return NextResponse.json({ ok: false, error: "fixed_target_only" }, { status: 400 });
  }

  const [metaResolved, igResolved] = await Promise.all([
    resolveSocialEnv("facebook", process.env),
    resolveSocialEnv("instagram", process.env),
  ]);

  const metaEnv = metaResolved.env || process.env;
  const igEnv = igResolved.env || process.env;
  const version = String(metaEnv.META_GRAPH_VERSION || "v26.0").trim();
  const metaToken = String(metaEnv.META_ACCESS_TOKEN || metaEnv.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  const pageId = String(metaEnv.FACEBOOK_PAGE_ID || metaEnv.META_TARGET_PAGE_ID || "").trim();
  let igUserId = String(igEnv.INSTAGRAM_BUSINESS_ACCOUNT_ID || "").trim();
  let metaLinkedIgUserId = "";

  const diagnostics = {
    target: TARGET,
    meta_source: metaResolved.source || "",
    meta_scopes: metaResolved.scopes || "",
    instagram_source: igResolved.source || "",
    instagram_scopes: igResolved.scopes || "",
    has_meta_token: Boolean(metaToken),
    has_page_id: Boolean(pageId),
    has_ig_user_id: Boolean(igUserId),
  };

  if (!metaToken) {
    return NextResponse.json({ ok: false, diagnostics, error: "meta_token_missing" }, { status: 503 });
  }

  if (pageId) {
    const pageUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}`);
    pageUrl.searchParams.set("fields", "instagram_business_account{id,username}");
    const pageResponse = await fetch(pageUrl, {
      headers: { Authorization: `Bearer ${metaToken}` },
      cache: "no-store",
    });
    const pageData = await readJson(pageResponse);
    if (pageResponse.ok) {
      metaLinkedIgUserId = String(pageData?.instagram_business_account?.id || "").trim();
      diagnostics.page_instagram_business_account = pageData?.instagram_business_account || null;
      diagnostics.has_meta_linked_ig_user_id = Boolean(metaLinkedIgUserId);
      if (metaLinkedIgUserId) igUserId = metaLinkedIgUserId;
      diagnostics.has_ig_user_id = Boolean(igUserId);
    } else {
      diagnostics.page_lookup_error = safeError("page_lookup", pageResponse, pageData);
    }
  }

  if (!igUserId) {
    return NextResponse.json({ ok: false, diagnostics, error: "instagram_business_account_id_missing" }, { status: 503 });
  }

  const fields = [
    "id",
    "username",
    "name",
    "biography",
    "followers_count",
    "follows_count",
    "media_count",
    "profile_picture_url",
    "website",
    "media.limit(100){id,caption,comments_count,like_count,view_count,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp}",
  ].join(",");

  const graphUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}`);
  graphUrl.searchParams.set("fields", `business_discovery.username(${TARGET}){${fields}}`);

  const response = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${metaToken}` },
    cache: "no-store",
  });
  const data = await readJson(response);

  if (!response.ok) {
    const facebookError = safeError("business_discovery_facebook_login", response, data);
    const igToken = String(igEnv.INSTAGRAM_ACCESS_TOKEN || "").trim();
    if (igToken) {
      const igVersion = String(igEnv.INSTAGRAM_GRAPH_VERSION || "v26.0").trim();
      const igFields = [
        "id","username","name","biography","followers_count","follows_count","media_count","profile_picture_url","website",
        "media.limit(100){id,caption,comments_count,like_count,media_type,media_product_type,permalink,thumbnail_url,timestamp}"
      ].join(",");
      const igUrl = new URL(`https://graph.instagram.com/${igVersion}/${encodeURIComponent(igUserId)}`);
      igUrl.searchParams.set("fields", `business_discovery.username(${TARGET}){${igFields}}`);
      const igResponse = await fetch(igUrl, {
        headers: { Authorization: `Bearer ${igToken}` },
        cache: "no-store",
      });
      const igData = await readJson(igResponse);
      if (igResponse.ok && igData?.business_discovery) {
        return NextResponse.json({
          ok: true,
          path: "instagram_login",
          diagnostics,
          business: igData.business_discovery,
          facebook_login_error: facebookError,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({
        ok: false,
        diagnostics,
        facebook_login_error: facebookError,
        instagram_login_error: safeError("business_discovery_instagram_login", igResponse, igData),
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      ok: false,
      diagnostics,
      facebook_login_error: facebookError,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const business = data?.business_discovery || null;
  return NextResponse.json({
    ok: true,
    path: "facebook_login",
    diagnostics,
    business,
  }, { headers: { "Cache-Control": "no-store" } });
}
