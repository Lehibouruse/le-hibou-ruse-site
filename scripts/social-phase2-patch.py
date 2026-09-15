from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, got {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "lib/social-runtime.mjs",
    'export const SOCIAL_PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];',
    'export const SOCIAL_PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "snapchat"];',
)

replace_once(
    "lib/social-credentials-runtime.mjs",
    'const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];',
    'const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "snapchat"];',
)
replace_once(
    "lib/social-credentials-runtime.mjs",
    '  threads: ["THREADS_ACCESS_TOKEN", "THREADS_REFRESH_TOKEN", "THREADS_USER_ID"],\n  x: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID"],',
    '  threads: ["THREADS_ACCESS_TOKEN", "THREADS_REFRESH_TOKEN", "THREADS_USER_ID"],\n  pinterest: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_REFRESH_TOKEN", "PINTEREST_USER_ID", "PINTEREST_USERNAME"],\n  x: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID"],',
)
replace_once(
    "lib/social-credentials-runtime.mjs",
    '  if (["youtube", "tiktok", "linkedin", "threads", "x"].includes(value)) return value;',
    '  if (["youtube", "tiktok", "linkedin", "threads", "pinterest", "x"].includes(value)) return value;',
)
replace_once(
    "lib/social-credentials-runtime.mjs",
    '  if (provider === "x") {\n    if (!clean(current.X_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "X refresh token absent; offline.access requis", baseEnv);',
    '''  if (provider === "pinterest") {
    if (!clean(current.PINTEREST_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "Pinterest refresh token absent", baseEnv);
    const clientId = clean(baseEnv.PINTEREST_APP_ID);
    const clientSecret = clean(baseEnv.PINTEREST_APP_SECRET);
    if (!clientId || !clientSecret) return markNeedsReauth(provider, credential, "Pinterest client credentials absents", baseEnv);
    const headers = { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` };
    const token = await tokenForm("https://api.pinterest.com/v5/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: current.PINTEREST_REFRESH_TOKEN,
    }, headers);
    return persistRefreshed(provider, credential, {
      PINTEREST_ACCESS_TOKEN: token.access_token,
      PINTEREST_REFRESH_TOKEN: token.refresh_token || current.PINTEREST_REFRESH_TOKEN,
      PINTEREST_USER_ID: current.PINTEREST_USER_ID || "",
      PINTEREST_USERNAME: current.PINTEREST_USERNAME || "",
    }, token, baseEnv);
  }

  if (provider === "x") {
    if (!clean(current.X_REFRESH_TOKEN)) return markNeedsReauth(provider, credential, "X refresh token absent; offline.access requis", baseEnv);''',
)

replace_once(
    "lib/social-oauth.mjs",
    'const SUPPORTED = ["youtube", "tiktok", "meta", "linkedin", "x", "threads"];',
    'const SUPPORTED = ["youtube", "tiktok", "meta", "linkedin", "pinterest", "x", "threads"];',
)
replace_once(
    "lib/social-oauth.mjs",
    '  if (provider === "x") return {\n    provider,',
    '''  if (provider === "pinterest") return {
    provider,
    clientId: required(env.PINTEREST_APP_ID, "PINTEREST_APP_ID"),
    clientSecret: required(env.PINTEREST_APP_SECRET, "PINTEREST_APP_SECRET"),
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: clean(env.PINTEREST_OAUTH_SCOPES) || "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
  };
  if (provider === "x") return {
    provider,''',
)
replace_once(
    "lib/social-oauth.mjs",
    'async function exchangeX(cfg, code, state, env) {',
    '''async function exchangePinterest(cfg, code, state, env) {
  const headers = { Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}` };
  const token = await formPost(cfg.tokenUrl, {
    grant_type: "authorization_code", code, redirect_uri: redirectUri(cfg.provider, env),
  }, headers);
  const profile = await jsonGet("https://api.pinterest.com/v5/user_account", token.access_token).catch(() => ({}));
  return {
    payload: { env: {
      PINTEREST_ACCESS_TOKEN: token.access_token,
      PINTEREST_REFRESH_TOKEN: token.refresh_token || "",
      PINTEREST_USER_ID: profile.id || "",
      PINTEREST_USERNAME: profile.username || "",
    }, profile },
    scopes: token.scope || cfg.scopes,
    expiresAt: nowIsoPlus(token.expires_in),
  };
}

async function exchangeX(cfg, code, state, env) {''',
)
replace_once(
    "lib/social-oauth.mjs",
    '  else if (provider === "linkedin") result = await exchangeLinkedIn(cfg, code, state, env);\n  else if (provider === "x") result = await exchangeX(cfg, code, state, env);',
    '  else if (provider === "linkedin") result = await exchangeLinkedIn(cfg, code, state, env);\n  else if (provider === "pinterest") result = await exchangePinterest(cfg, code, state, env);\n  else if (provider === "x") result = await exchangeX(cfg, code, state, env);',
)

replace_once(
    "lib/social-gateway.mjs",
    'const PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];',
    'const PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "snapchat"];',
)
replace_once(
    "lib/social-gateway.mjs",
    '  if (provider === "x") return Boolean(clean(env.X_ACCESS_TOKEN));\n  return false;',
    '  if (provider === "pinterest") return hasAll(env, ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"]);\n  if (provider === "x") return Boolean(clean(env.X_ACCESS_TOKEN));\n  return false;',
)
replace_once(
    "lib/social-gateway.mjs",
    '  } else if (provider === "x") {\n    need("X_ACCESS_TOKEN");',
    '  } else if (provider === "pinterest") {\n    need("PINTEREST_ACCESS_TOKEN"); need("PINTEREST_BOARD_ID");\n  } else if (provider === "x") {\n    need("X_ACCESS_TOKEN");',
)
replace_once(
    "lib/social-gateway.mjs",
    'function directCapabilities(provider) {\n  if (["youtube", "instagram", "facebook", "tiktok", "threads", "linkedin", "x"].includes(provider)) return ["video_native"];\n  return [];\n}',
    'function directCapabilities(provider) {\n  if (provider === "pinterest") return ["image_native", "video_native"];\n  if (["youtube", "instagram", "facebook", "tiktok", "threads", "linkedin", "x"].includes(provider)) return ["video_native"];\n  return [];\n}',
)
pinterest_gateway = '''function pinterestBase(env) {
  return flag(env.PINTEREST_SANDBOX, true) ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
}

function pinterestMediaKind(payload) {
  const explicit = clean(payload.metadata?.media_type).toLowerCase();
  if (["image", "video"].includes(explicit)) return explicit;
  try {
    const path = new URL(payload.media_url).pathname.toLowerCase();
    if (/\\.(png|jpe?g|webp|gif)$/.test(path)) return "image";
  } catch {}
  return "video";
}

async function waitPinterestMedia(base, mediaId, headers, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await getJson(`${base}/media/${encodeURIComponent(mediaId)}`, headers);
    const status = clean(state.status || state.media_status).toLowerCase();
    if (["succeeded", "success", "ready"].includes(status)) return state;
    if (["failed", "error"].includes(status)) throw new Error(`Pinterest media ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Pinterest media toujours en traitement");
}

async function dispatchPinterest(payload, env) {
  const token = clean(env.PINTEREST_ACCESS_TOKEN);
  const boardId = clean(payload.metadata?.board_id) || clean(env.PINTEREST_BOARD_ID);
  if (!token) throw new Error("Pinterest access token absent");
  if (!boardId) throw new Error("Pinterest board_id absent");
  const sandbox = flag(env.PINTEREST_SANDBOX, true);
  const base = pinterestBase(env);
  const headers = { Authorization: `Bearer ${token}` };
  const common = {
    board_id: boardId,
    title: (clean(payload.title) || "Le Hibou Rusé").slice(0, 100),
    description: clean(payload.caption).slice(0, 800),
    ...(clean(payload.metadata?.link) ? { link: clean(payload.metadata.link) } : {}),
  };
  let created;
  if (pinterestMediaKind(payload) === "image") {
    created = (await postJson(`${base}/pins`, {
      ...common,
      media_source: { source_type: "image_url", url: assertMediaUrl(payload.media_url) },
    }, headers)).data;
  } else {
    const coverImageUrl = clean(payload.metadata?.cover_image_url);
    if (!coverImageUrl) throw new Error("Pinterest vidéo requiert metadata.cover_image_url");
    const media = await fetchMedia(payload.media_url);
    const registered = (await postJson(`${base}/media`, { media_type: "video" }, headers)).data;
    const mediaId = clean(registered.media_id || registered.id);
    const uploadUrl = clean(registered.upload_url);
    const uploadParameters = registered.upload_parameters && typeof registered.upload_parameters === "object" ? registered.upload_parameters : {};
    if (!mediaId || !uploadUrl) throw new Error("Pinterest media registration incomplète");
    const form = new FormData();
    for (const [key, value] of Object.entries(uploadParameters)) form.append(key, String(value));
    form.append("file", new Blob([media.bytes], { type: media.contentType || "video/mp4" }), "hibou-pinterest.mp4");
    const upload = await fetch(uploadUrl, { method: "POST", body: form, cache: "no-store" });
    if (!upload.ok) throw new Error(`Pinterest media upload ${upload.status}: ${(await upload.text()).slice(0, 500)}`);
    await waitPinterestMedia(base, mediaId, headers);
    created = (await postJson(`${base}/pins`, {
      ...common,
      media_source: { source_type: "video_id", media_id: mediaId, cover_image_url: assertMediaUrl(coverImageUrl) },
    }, headers)).data;
  }
  const pinId = clean(created.id);
  if (!pinId) throw new Error("Pinterest n’a pas renvoyé de Pin id");
  return {
    provider: "pinterest", pin_id: pinId, sandbox,
    url: sandbox ? "" : `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`,
  };
}

async function dispatchDirect(provider, payload, env) {
  if (provider === "tiktok") return dispatchTikTok(payload, env);'''
replace_once(
    "lib/social-gateway.mjs",
    'async function dispatchDirect(provider, payload, env) {\n  if (provider === "tiktok") return dispatchTikTok(payload, env);',
    pinterest_gateway,
)
replace_once(
    "lib/social-gateway.mjs",
    '  if (provider === "youtube") return dispatchYouTube(payload, env);\n  if (provider === "x") return dispatchX(payload, env);',
    '  if (provider === "youtube") return dispatchYouTube(payload, env);\n  if (provider === "pinterest") return dispatchPinterest(payload, env);\n  if (provider === "x") return dispatchX(payload, env);',
)

replace_once(
    "lib/social-publication.mjs",
    '  threads: { id: "ID Threads", url: "URL Threads" },\n  snapchat: { id: "ID Snapchat", url: "URL Snapchat" },',
    '  threads: { id: "ID Threads", url: "URL Threads" },\n  pinterest: { id: "ID Pinterest", url: "URL Pinterest" },\n  snapchat: { id: "ID Snapchat", url: "URL Snapchat" },',
)
replace_once(
    "lib/social-publication.mjs",
    '    threads: result.thread_id,\n    snapchat: result.post_id || result.media_id,',
    '    threads: result.thread_id,\n    pinterest: result.pin_id,\n    snapchat: result.post_id || result.media_id,',
)
replace_once(
    "lib/social-publication.mjs",
    '    if (provider === "linkedin") url = `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}`;',
    '    if (provider === "linkedin") url = `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}`;\n    if (provider === "pinterest") url = `https://www.pinterest.com/pin/${encodeURIComponent(id)}/`;',
)
replace_once(
    "lib/agent-capabilities.mjs",
    '    provider: str("youtube, instagram, facebook, tiktok, linkedin, threads, x ou snapchat"),',
    '    provider: str("youtube, instagram, facebook, tiktok, linkedin, threads, pinterest, x ou snapchat"),',
)

replace_once(
    "app/admin/social/route.js",
    '  x: {\n    label: "X",',
    '''  pinterest: {
    label: "Pinterest",
    portal: "https://developers.pinterest.com/apps/",
    note: "Créer l’app Pinterest, demander Trial/Standard access, déclarer le callback et utiliser le Sandbox pour les premiers tests.",
  },
  x: {
    label: "X",''',
)
replace_once(
    "app/admin/social/route.js",
    '  const connectedCount = readiness.filter((provider) => credentials.find((item) => item.provider === provider.provider)?.status === "Connected").length;\n  const appReadyCount = readiness.filter((provider) => provider.ready).length;\n  const html =',
    '  const connectedCount = readiness.filter((provider) => credentials.find((item) => item.provider === provider.provider)?.status === "Connected").length;\n  const appReadyCount = readiness.filter((provider) => provider.ready).length;\n  let callbackOrigin = "non configuré";\n  try { callbackOrigin = new URL(readiness[0]?.redirect_uri || "").origin; } catch {}\n  const html =',
)
replace_once(
    "app/admin/social/route.js",
    '<span class="pill">Domaine callback : <strong>d4d5d6.com</strong></span>',
    '<span class="pill">Domaine callback : <strong>${esc(callbackOrigin)}</strong></span>',
)
replace_once(
    "app/admin/social/route.js",
    'Ordre conseillé : 1) rattacher et vérifier d4d5d6.com ; 2) créer les apps et leurs secrets serveur ; 3) copier exactement les callbacks affichés ; 4) revenir ici et cliquer Connecter ; 5) conserver social_test_mode=TRUE jusqu’aux dry-runs et validations humaines.',
    'Ordre conseillé : 1) créer les apps et leurs secrets serveur ; 2) copier exactement les callbacks affichés ; 3) revenir ici et cliquer Connecter ; 4) conserver social_test_mode=TRUE jusqu’aux dry-runs et validations humaines. Le domaine d4d5d6.com pourra remplacer l’alias Vercel après validation DNS sans bloquer les premiers OAuth.',
)

env_path = Path(".env.example")
env_text = env_path.read_text()
anchor = "THREADS_OAUTH_SCOPES=\nLINKEDIN_CLIENT_ID="
if anchor not in env_text:
    raise SystemExit(".env.example: social OAuth anchor missing")
env_path.write_text(env_text.replace(
    anchor,
    "THREADS_OAUTH_SCOPES=\nPINTEREST_APP_ID=\nPINTEREST_APP_SECRET=\nPINTEREST_OAUTH_SCOPES=\nPINTEREST_BOARD_ID=\nPINTEREST_SANDBOX=true\nLINKEDIN_CLIENT_ID=",
    1,
))

replace_once(
    "tests/social-oauth.test.mjs",
    '  THREADS_APP_ID: "threads-id",\n  THREADS_APP_SECRET: "threads-secret",',
    '  THREADS_APP_ID: "threads-id",\n  THREADS_APP_SECRET: "threads-secret",\n  PINTEREST_APP_ID: "pin-id",\n  PINTEREST_APP_SECRET: "pin-secret",',
)
replace_once(
    "tests/social-oauth.test.mjs",
    'test("les six providers OAuth exposent un callback HTTPS sur le domaine canonique", () => {\n  const readiness = oauthProviderReadiness(base);\n  assert.equal(readiness.length, 6);',
    'test("les sept providers OAuth exposent un callback HTTPS sur le domaine canonique", () => {\n  const readiness = oauthProviderReadiness(base);\n  assert.equal(readiness.length, 7);',
)
oauth_test = Path("tests/social-oauth.test.mjs")
oauth_text = oauth_test.read_text()
if 'test("Pinterest prépare OAuth' not in oauth_text:
    oauth_text += '''

test("Pinterest prépare OAuth avec les scopes organiques sans exposer le secret", () => {
  const auth = buildSocialAuthorization("pinterest", base);
  const url = new URL(auth.url);
  assert.equal(url.origin, "https://www.pinterest.com");
  assert.match(url.searchParams.get("scope") || "", /pins:write/);
  assert.match(url.searchParams.get("scope") || "", /boards:read/);
  assert.equal(auth.url.includes("pin-secret"), false);
});
'''
    oauth_test.write_text(oauth_text)

gateway_test = Path("tests/social-gateway.test.mjs")
gateway_text = gateway_test.read_text()
if 'test("Pinterest utilise l API directe' not in gateway_text:
    gateway_text += '''

test("Pinterest utilise l API directe avant le webhook en mode auto et reste en dry-run", async () => {
  const env = {
    PINTEREST_ACCESS_TOKEN: "pin-token",
    PINTEREST_BOARD_ID: "12345",
    HIBOU_SOCIAL_PINTEREST_WEBHOOK_URL: "https://example.com/pinterest",
  };
  const status = socialGatewayStatus(env).find((item) => item.provider === "pinterest");
  assert.equal(status.mode, "direct");
  assert.deepEqual(status.direct_capabilities, ["image_native", "video_native"]);
  assert.equal(JSON.stringify(status).includes("pin-token"), false);
  const plan = await dispatchSocialPost({ provider: "pinterest", media_url: "https://example.com/video.mp4", caption: "Test", dry_run: true }, env);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.gateway.mode, "direct");
});
'''
    gateway_test.write_text(gateway_text)

runtime_test = Path("tests/social-runtime.test.mjs")
runtime_text = runtime_test.read_text()
if 'social_mode_pinterest: "direct"' not in runtime_text:
    runtime_text = runtime_text.replace('    social_mode_x: "invalid",', '    social_mode_pinterest: "direct",\n    social_mode_x: "invalid",', 1)
if 'HIBOU_SOCIAL_PINTEREST_MODE' not in runtime_text:
    runtime_text = runtime_text.replace('  assert.equal(env.HIBOU_SOCIAL_YOUTUBE_MODE, "webhook");', '  assert.equal(env.HIBOU_SOCIAL_YOUTUBE_MODE, "webhook");\n  assert.equal(env.HIBOU_SOCIAL_PINTEREST_MODE, "direct");', 1)
runtime_test.write_text(runtime_text)
