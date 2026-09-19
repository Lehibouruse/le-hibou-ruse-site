import { queryRecords, TABLES } from "../../../../lib/airtable.js";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function present(v){ return String(v ?? "").trim().length > 0; }

export async function GET() {
  let env = process.env;
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 250 });
    env = socialRuntimeEnv(configurationMap(records), process.env);
  } catch {}
  return Response.json({
    ok: true,
    meta_app_id_present: present(env.META_APP_ID),
    meta_app_id: present(env.META_APP_ID) ? String(env.META_APP_ID) : "",
    meta_app_secret_present: present(env.META_APP_SECRET),
    meta_graph_version_present: present(env.META_GRAPH_VERSION),
    meta_graph_version: present(env.META_GRAPH_VERSION) ? String(env.META_GRAPH_VERSION) : "",
    meta_target_page_id_present: present(env.META_TARGET_PAGE_ID),
    social_vault_ready: present(env.HIBOU_SOCIAL_VAULT_KEY) || present(env.CRON_SECRET),
    callback: "https://d4d5d6.com/api/social/oauth/meta/callback",
    commit: String(process.env.VERCEL_GIT_COMMIT_SHA || ""),
    deployment_url: String(process.env.VERCEL_URL || ""),
  }, { headers: { "Cache-Control": "no-store" } });
}
