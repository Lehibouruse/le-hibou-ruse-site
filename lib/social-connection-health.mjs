import { queryRecords, TABLES, updateRecord } from "./airtable.js";
import { resolveSocialEnv } from "./social-credentials-runtime.mjs";

const SUPPORTED_NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x"];

function clean(value) { return String(value ?? "").trim(); }
function escFormula(value) { return clean(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'"); }
function platformLabel(network) {
  return ({
    youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
    linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", x: "X",
  })[network] || network;
}

async function readJson(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error_description || data?.message || data?.error || response.statusText;
    const error = new Error(`${label} ${response.status}: ${String(detail || "unknown").slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function accountRecord(network) {
  const platform = platformLabel(network);
  const rows = await queryRecords(TABLES.socialAccounts, {
    filterByFormula: `{Plateforme}='${escFormula(platform)}'`,
    pageSize: 3,
    priorityAware: false,
  });
  return rows[0] || null;
}

function nextHumanAction(network) {
  if (network === "tiktok") return "Après lecture API : effectuer un test SELF_ONLY ; publication publique seulement après audit TikTok.";
  if (network === "linkedin") return "Après lecture API : effectuer un test de publication contrôlé ; l’analytics avancée dépend de l’accès Community Management.";
  if (network === "pinterest") return "Après lecture API : effectuer un test sandbox/contrôlé avant de considérer la publication directe validée.";
  return "Effectuer ensuite un test de publication non publique/contrôlée avant d’autoriser le live.";
}

async function markSuccess(network, { scopes = "", technicalId = "", publicId = "", profileUrl = "" } = {}) {
  const row = await accountRecord(network);
  if (!row) return false;
  const now = new Date().toISOString();
  const fields = {
    "Statut connexion": "Connecté",
    "Mode d’intégration": "API officielle directe",
    "Direct Hibou prêt": true,
    "OAuth Hibou connecté": true,
    "Auth direct OK": true,
    "Lecture API OK": true,
    "État direct": "READ_TESTED",
    "Dernier test API": now,
    "Dernière vérification": now,
    "Blocage API direct": "",
    "Action humaine restante": nextHumanAction(network),
  };
  if (scopes) fields["Permissions API"] = scopes;
  if (technicalId) fields["Identifiant technique"] = technicalId;
  if (publicId) fields["Identifiant public"] = publicId;
  if (profileUrl) fields["Profil public"] = profileUrl;
  await updateRecord(TABLES.socialAccounts, row.id, fields);
  return true;
}

async function markFailure(network, error, { oauthConnected = false } = {}) {
  const row = await accountRecord(network);
  if (!row) return false;
  const status = Number(error?.status || 0);
  const reauth = [401, 403].includes(status);
  const now = new Date().toISOString();
  await updateRecord(TABLES.socialAccounts, row.id, {
    "OAuth Hibou connecté": oauthConnected && !reauth,
    "Auth direct OK": false,
    "Lecture API OK": false,
    "État direct": reauth ? "NEEDS_REAUTH" : oauthConnected ? "AUTH_ERROR" : "NOT_CONFIGURED",
    "Dernier test API": now,
    "Dernière vérification": now,
    "Blocage API direct": String(error?.message || error).slice(0, 1500),
    "Action humaine restante": reauth
      ? "Reconnecter le compte via /admin/social puis relancer le test API."
      : oauthConnected
        ? "Corriger la configuration/scopes de l’app puis relancer le test API."
        : "Terminer l’OAuth direct via /admin/social avant de relancer le test API.",
  });
  return true;
}

async function probeYoutube(env, scopes, fetchImpl) {
  const token = clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!token) throw new Error("YOUTUBE_ACCESS_TOKEN absent");
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }), "YouTube identity");
  const channel = data?.items?.[0];
  if (!channel?.id) throw new Error("YouTube: aucun canal authentifié retourné");
  return {
    scopes,
    technicalId: channel.id,
    publicId: clean(channel.snippet?.customUrl || channel.snippet?.title),
    profileUrl: channel.snippet?.customUrl ? `https://youtube.com/${channel.snippet.customUrl}` : `https://youtube.com/channel/${channel.id}`,
  };
}

async function probeTikTok(env, scopes, fetchImpl) {
  const token = clean(env.TIKTOK_ACCESS_TOKEN);
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN absent");
  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set("fields", "open_id,union_id,avatar_url,display_name,profile_deep_link");
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }), "TikTok identity");
  const user = data?.data?.user;
  if (!user?.open_id) throw new Error("TikTok: utilisateur authentifié absent");
  return { scopes, technicalId: user.open_id, publicId: clean(user.display_name), profileUrl: clean(user.profile_deep_link) };
}

async function probeX(env, scopes, fetchImpl) {
  const token = clean(env.X_ACCESS_TOKEN);
  if (!token) throw new Error("X_ACCESS_TOKEN absent");
  const url = new URL("https://api.x.com/2/users/me");
  url.searchParams.set("user.fields", "id,name,username");
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }), "X identity");
  const user = data?.data;
  if (!user?.id) throw new Error("X: utilisateur authentifié absent");
  return { scopes, technicalId: user.id, publicId: clean(user.username || user.name), profileUrl: user.username ? `https://x.com/${user.username}` : "" };
}

async function probeLinkedIn(env, scopes, fetchImpl) {
  const token = clean(env.LINKEDIN_ACCESS_TOKEN);
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN absent");
  const data = await readJson(await fetchImpl("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }), "LinkedIn identity");
  if (!data?.sub) throw new Error("LinkedIn: identité authentifiée absente");
  return { scopes, technicalId: `urn:li:person:${data.sub}`, publicId: clean(data.name || data.given_name || data.sub) };
}

async function probeThreads(env, scopes, fetchImpl) {
  const token = clean(env.THREADS_ACCESS_TOKEN);
  if (!token) throw new Error("THREADS_ACCESS_TOKEN absent");
  const version = clean(env.THREADS_API_VERSION) || "v1.0";
  const url = new URL(`https://graph.threads.net/${version}/me`);
  url.searchParams.set("fields", "id,username,name");
  url.searchParams.set("access_token", token);
  const data = await readJson(await fetchImpl(url, { cache: "no-store" }), "Threads identity");
  if (!data?.id) throw new Error("Threads: identité authentifiée absente");
  return { scopes, technicalId: data.id, publicId: clean(data.username || data.name), profileUrl: data.username ? `https://www.threads.net/@${data.username}` : "" };
}

async function probePinterest(env, scopes, fetchImpl) {
  const token = clean(env.PINTEREST_ACCESS_TOKEN);
  if (!token) throw new Error("PINTEREST_ACCESS_TOKEN absent");
  const data = await readJson(await fetchImpl("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  }), "Pinterest identity");
  const username = clean(data?.username || env.PINTEREST_USERNAME);
  const technicalId = clean(data?.id || env.PINTEREST_USER_ID || username);
  if (!technicalId) throw new Error("Pinterest: compte authentifié absent");
  return { scopes, technicalId, publicId: username || technicalId, profileUrl: username ? `https://www.pinterest.com/${username}/` : "" };
}

async function probeMetaNetwork(network, env, scopes, fetchImpl) {
  const token = clean(env.FACEBOOK_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN);
  if (!token) throw new Error("META/FACEBOOK access token absent");
  const version = clean(env.META_GRAPH_VERSION);
  const base = version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
  if (network === "facebook") {
    const pageId = clean(env.FACEBOOK_PAGE_ID);
    if (!pageId) throw new Error("FACEBOOK_PAGE_ID absent");
    const url = new URL(`${base}/${encodeURIComponent(pageId)}`);
    url.searchParams.set("fields", "id,name,link");
    url.searchParams.set("access_token", token);
    const data = await readJson(await fetchImpl(url, { cache: "no-store" }), "Facebook identity");
    if (!data?.id) throw new Error("Facebook: page authentifiée absente");
    return { scopes, technicalId: data.id, publicId: clean(data.name), profileUrl: clean(data.link) };
  }
  const accountId = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  if (!accountId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID absent");
  const url = new URL(`${base}/${encodeURIComponent(accountId)}`);
  url.searchParams.set("fields", "id,username,name,profile_picture_url");
  url.searchParams.set("access_token", token);
  const data = await readJson(await fetchImpl(url, { cache: "no-store" }), "Instagram identity");
  if (!data?.id) throw new Error("Instagram: compte authentifié absent");
  return { scopes, technicalId: data.id, publicId: clean(data.username || data.name), profileUrl: data.username ? `https://instagram.com/${data.username}` : "" };
}

async function probe(network, resolved, fetchImpl) {
  const scopes = clean(resolved.scopes);
  if (network === "youtube") return probeYoutube(resolved.env, scopes, fetchImpl);
  if (network === "tiktok") return probeTikTok(resolved.env, scopes, fetchImpl);
  if (network === "x") return probeX(resolved.env, scopes, fetchImpl);
  if (network === "linkedin") return probeLinkedIn(resolved.env, scopes, fetchImpl);
  if (network === "threads") return probeThreads(resolved.env, scopes, fetchImpl);
  if (network === "pinterest") return probePinterest(resolved.env, scopes, fetchImpl);
  if (["instagram", "facebook"].includes(network)) return probeMetaNetwork(network, resolved.env, scopes, fetchImpl);
  throw new Error(`Réseau non testable: ${network}`);
}

export async function testSocialConnection(networkInput, baseEnv = process.env, fetchImpl = fetch) {
  const network = clean(networkInput).toLowerCase();
  if (!SUPPORTED_NETWORKS.includes(network)) throw new Error(`Réseau non pris en charge: ${network || "vide"}`);
  const resolved = await resolveSocialEnv(network, baseEnv);
  const oauthConnected = resolved.source === "encrypted_vault";
  if (!oauthConnected) {
    const error = new Error(`${network}: credential OAuth chiffré absent`);
    await markFailure(network, error, { oauthConnected: false });
    return { provider: network, ok: false, state: "NOT_CONFIGURED", error: error.message };
  }
  try {
    const identity = await probe(network, resolved, fetchImpl);
    await markSuccess(network, identity);
    return {
      provider: network,
      ok: true,
      state: "READ_TESTED",
      identity: { technical_id: identity.technicalId, public_id: identity.publicId, profile_url: identity.profileUrl },
      credential_source: resolved.source,
    };
  } catch (error) {
    await markFailure(network, error, { oauthConnected: true });
    return {
      provider: network,
      ok: false,
      state: [401, 403].includes(Number(error?.status || 0)) ? "NEEDS_REAUTH" : "AUTH_ERROR",
      error: String(error?.message || error).slice(0, 500),
    };
  }
}

export async function testVaultProviderConnections(vaultProvider, baseEnv = process.env, fetchImpl = fetch) {
  const provider = clean(vaultProvider).toLowerCase();
  const networks = provider === "meta" ? ["facebook", "instagram"] : [provider];
  const results = [];
  for (const network of networks.filter((item) => SUPPORTED_NETWORKS.includes(item))) {
    results.push(await testSocialConnection(network, baseEnv, fetchImpl));
  }
  return results;
}

export async function testAllSocialConnections(baseEnv = process.env, fetchImpl = fetch) {
  const results = [];
  for (const network of SUPPORTED_NETWORKS) results.push(await testSocialConnection(network, baseEnv, fetchImpl));
  return results;
}

export const SOCIAL_READ_TEST_NETWORKS = [...SUPPORTED_NETWORKS];
