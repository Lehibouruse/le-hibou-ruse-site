import { dispatchSocialPost as dispatchEnhanced, socialGatewayStatus as enhancedStatus } from "./social-gateway-enhanced.mjs";
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

export function socialGatewayStatus(env = process.env) {
  return enhancedStatus(env).map((item) => item.provider === "tiktok"
    ? { ...item, direct_capabilities: [...new Set([...(item.direct_capabilities || []), "photo_native", "photo_carousel"])] }
    : item);
}

export async function dispatchSocialPost(input, env = process.env) {
  const provider = clean(input?.provider).toLowerCase();
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
