import assert from "node:assert/strict";
import test from "node:test";
import { dispatchSocialPost, socialGatewayStatus } from "../lib/social-gateway-enhanced.mjs";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function withFetch(fake, fn) {
  const previous = global.fetch;
  global.fetch = fake;
  try { return await fn(); } finally { global.fetch = previous; }
}

test("les capacités enrichies sont annoncées sans activer le live", () => {
  const env = {
    META_ACCESS_TOKEN: "meta",
    INSTAGRAM_ACCESS_TOKEN: "instagram",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig",
    FACEBOOK_PAGE_ID: "page",
    THREADS_ACCESS_TOKEN: "threads",
    THREADS_USER_ID: "th-user",
    LINKEDIN_ACCESS_TOKEN: "li",
    LINKEDIN_AUTHOR_URN: "urn:li:person:1",
    LINKEDIN_ORGANIZATION_URN: "urn:li:organization:2",
    LINKEDIN_VERSION: "202608",
    YOUTUBE_ACCESS_TOKEN: "yt",
  };
  const byProvider = Object.fromEntries(socialGatewayStatus(env).map((item) => [item.provider, item]));
  assert.ok(byProvider.instagram.direct_capabilities.includes("carousel_images"));
  assert.ok(byProvider.facebook.direct_capabilities.includes("reel_native"));
  assert.ok(byProvider.threads.direct_capabilities.includes("text_native"));
  assert.ok(byProvider.linkedin.direct_capabilities.includes("organization_author"));
  assert.ok(byProvider.youtube.direct_capabilities.includes("custom_thumbnail"));
});

test("LinkedIn image utilise l'organisation quand elle est configurée", async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ target, init });
    if (target === "https://cdn.example.com/card.png") return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } });
    if (target.includes("/rest/images?action=initializeUpload")) return jsonResponse({ value: { uploadUrl: "https://upload.linkedin.example/image", image: "urn:li:image:abc" } });
    if (target === "https://upload.linkedin.example/image") return new Response("", { status: 201 });
    if (target === "https://api.linkedin.com/rest/posts") return jsonResponse({}, 201, { "x-restli-id": "urn:li:share:999" });
    throw new Error(`unexpected ${target}`);
  };
  const env = { LINKEDIN_ACCESS_TOKEN: "token", LINKEDIN_AUTHOR_URN: "urn:li:person:1", LINKEDIN_ORGANIZATION_URN: "urn:li:organization:2", LINKEDIN_VERSION: "202608" };
  const result = await withFetch(fakeFetch, () => dispatchSocialPost({ provider: "linkedin", media_url: "https://cdn.example.com/card.png", caption: "Bonjour", metadata: { media_type: "image", alt_text: "Carte Hibou" }, dry_run: false }, env));
  assert.equal(result.result.post_id, "urn:li:share:999");
  assert.equal(result.result.author, "urn:li:organization:2");
  const postCall = calls.find((call) => call.target === "https://api.linkedin.com/rest/posts");
  assert.equal(JSON.parse(postCall.init.body).author, "urn:li:organization:2");
});

test("YouTube ajoute une miniature personnalisée après l'upload vidéo", async () => {
  const fakeFetch = async (url, init = {}) => {
    const target = String(url);
    if (target === "https://cdn.example.com/video.mp4") return new Response(Buffer.from([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "video/mp4" } });
    if (target.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) return jsonResponse({}, 200, { location: "https://upload.youtube.example/session" });
    if (target === "https://upload.youtube.example/session") return jsonResponse({ id: "video123" });
    if (target === "https://cdn.example.com/thumb.png") return new Response(Buffer.from([9, 8, 7]), { status: 200, headers: { "Content-Type": "image/png" } });
    if (target.startsWith("https://www.googleapis.com/upload/youtube/v3/thumbnails/set")) return jsonResponse({ items: [{ default: { url: "https://i.ytimg.com/x" } }] });
    throw new Error(`unexpected ${target} ${init.method || "GET"}`);
  };
  const result = await withFetch(fakeFetch, () => dispatchSocialPost({ provider: "youtube", media_url: "https://cdn.example.com/video.mp4", caption: "Test", metadata: { thumbnail_url: "https://cdn.example.com/thumb.png" }, dry_run: false }, { YOUTUBE_ACCESS_TOKEN: "yt-token" }));
  assert.equal(result.result.video_id, "video123");
  assert.equal(result.result.thumbnail_set, true);
});

test("Facebook publie une image native via l'edge photos", async () => {
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.includes("/page123/photos")) return jsonResponse({ id: "photo123", post_id: "page123_456" });
    throw new Error(`unexpected ${target}`);
  };
  const result = await withFetch(fakeFetch, () => dispatchSocialPost({ provider: "facebook", media_url: "https://cdn.example.com/card.jpg", caption: "Carte", metadata: { media_type: "image" }, dry_run: false }, { META_ACCESS_TOKEN: "meta", FACEBOOK_PAGE_ID: "page123", META_GRAPH_VERSION: "v26.0" }));
  assert.equal(result.result.photo_id, "photo123");
  assert.equal(result.result.post_id, "page123_456");
  assert.equal(result.result.media_type, "image");
});

test("Instagram publie une image native et attend le container", async () => {
  let postCount = 0;
  const fakeFetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/ig123/media_publish")) return jsonResponse({ id: "ig-media-9" });
    if (target.includes("/ig123/media") && init.method === "POST") { postCount += 1; return jsonResponse({ id: "container-9" }); }
    if (target.includes("/container-9?") && (!init.method || init.method === "GET")) return jsonResponse({ status_code: "FINISHED" });
    throw new Error(`unexpected ${target}`);
  };
  const result = await withFetch(fakeFetch, () => dispatchSocialPost({ provider: "instagram", media_url: "https://cdn.example.com/card.jpg", caption: "Carte", metadata: { media_type: "image" }, dry_run: false }, { INSTAGRAM_ACCESS_TOKEN: "instagram", INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig123", INSTAGRAM_GRAPH_VERSION: "v26.0" }));
  assert.equal(postCount, 1);
  assert.equal(result.result.media_id, "ig-media-9");
  assert.equal(result.result.media_type, "image");
});

test("Threads text-only reste testable sans media_url en dry-run", async () => {
  const result = await dispatchSocialPost({ provider: "threads", caption: "Texte uniquement", metadata: { media_type: "text" }, dry_run: true }, {});
  assert.equal(result.dry_run, true);
  assert.equal(result.provider, "threads");
  assert.equal(result.payload.caption, "Texte uniquement");
});
