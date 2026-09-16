import { dispatchSocialPost as dispatchEnhanced, socialGatewayStatus as enhancedStatus } from "./social-gateway-enhanced.mjs";
import { resolvePinterestBoard } from "./social-pinterest-board.mjs";
import { dispatchTikTokPhoto, tiktokPhotoUrls } from "./social-tiktok-photo.mjs";

function clean(value) { return String(value ?? "").trim(); }

function tiktokPhotoRequested(input = {}) {
  const explicit = clean(input?.metadata?.media_type || input?.media_type).toLowerCase();
  if (["image", "photo", "carousel"].includes(explicit)) return true;
  if (Array.isArray(input?.metadata?.media_urls) && input.metadata.media_urls.filter(Boolean).length) return true;
  try {
    return /\.(png|jpe?g|webp|gif)$/i.test(new URL(clean(input?.media_url)).pathname);
  } catch {
    return false;
  }
}

function pinterestBoardAutodiscoverable(env = process.env) {
  return Boolean(clean(env.PINTEREST_ACCESS_TOKEN)) && !clean(env.PINTEREST_BOARD_ID);
}

function enrichPinterestStatus(item, env) {
  if (item.provider !== "pinterest" || !pinterestBoardAutodiscoverable(env)) return item;
  const mode = item.requested_mode === "webhook" && item.webhook_configured ? "webhook" : "direct";
  return {
    ...item,
    configured: true,
    direct_configured: true,
    mode,
    live_publish_supported: true,
    missing_direct_env: [],
    constraints: [...new Set([...(item.constraints || []), "pinterest_board_auto_discovery_at_dispatch"])],
  };
}

export function socialGatewayStatus(env = process.env) {
  return enhancedStatus(env).map((item) => {
    if (item.provider === "tiktok") {
      return { ...item, direct_capabilities: [...new Set([...(item.direct_capabilities || []), "photo_native", "photo_carousel"])] };
    }
    return enrichPinterestStatus(item, env);
  });
}

export async function dispatchSocialPost(input, env = process.env) {
  const provider = clean(input?.provider).toLowerCase();

  if (provider === "pinterest") {
    const plan = socialGatewayStatus(env).find((item) => item.provider === "pinterest");
    if (input?.dry_run !== false) {
      const previewEnv = pinterestBoardAutodiscoverable(env) ? { ...env, PINTEREST_BOARD_ID: "AUTO_DISCOVER_AT_DISPATCH" } : env;
      const preview = await dispatchEnhanced(input, previewEnv);
      return { ...preview, gateway: plan, pinterest_board_resolution: pinterestBoardAutodiscoverable(env) ? "auto_discover_at_dispatch" : "configured" };
    }
    if (plan?.mode !== "direct" || !pinterestBoardAutodiscoverable(env)) return dispatchEnhanced(input, env);
    const selected = await resolvePinterestBoard(env);
    const result = await dispatchEnhanced(input, { ...env, PINTEREST_BOARD_ID: selected.board_id });
    return { ...result, pinterest_board_resolution: selected.source, pinterest_board_id: selected.board_id };
  }

  if (provider !== "tiktok" || !tiktokPhotoRequested(input)) return dispatchEnhanced(input, env);

  const plan = socialGatewayStatus(env).find((item) => item.provider === "tiktok");
  if (input?.dry_run !== false) {
    const photoUrls = tiktokPhotoUrls(input);
    return {
      ok: true,
      dry_run: true,
      provider: "tiktok",
      gateway: plan,
      payload: {
        media_type: "photo",
        photo_count: photoUrls.length,
        media_urls: photoUrls,
        title: clean(input?.title).slice(0, 90),
        caption: clean(input?.caption).slice(0, 4000),
        privacy_level: clean(input?.privacy_level) || "SELF_ONLY",
      },
    };
  }
  if (plan?.mode !== "direct") return dispatchEnhanced(input, env);
  const result = await dispatchTikTokPhoto(input, env);
  return { ok: true, dry_run: false, provider: "tiktok", mode: "direct", result };
}
