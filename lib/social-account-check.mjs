import { queryRecords, TABLES, updateRecord } from "./airtable.js";
import { resolveSocialEnv } from "./social-credentials-runtime.mjs";
import { pinterestAccountCheck } from "./pinterest-social.mjs";

const LABELS = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", threads: "Threads", tiktok: "TikTok", linkedin: "LinkedIn", pinterest: "Pinterest", x: "X", snapchat: "Snapchat" };
function clean(value) { return String(value ?? "").trim(); }
async function data(response, label) {
  const text = await response.text(); let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { text: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`${label} ${response.status}: ${payload.error?.message || payload.message || payload.error || payload.text || response.statusText}`);
  return payload;
}
async function bearerGet(url, token) { return data(await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }), "Social read"); }
async function findAccount(provider) {
  const label = LABELS[provider]; if (!label) return null;
  const records = await queryRecords(TABLES.socialAccounts || "tbljG9MzITNILBoHi", { filterByFormula: `{Plateforme}='${label}'`, pageSize: 2 }).catch(() => []);
  return records[0] || null;
}
async function recordState(provider, state, result = {}, error = "") {
  const account = await findAccount(provider);
  if (!account) return;
  const readOk = state === "READ_TESTED" || state === "CONNECTED_AND_TESTED";
  const fields = {
    "État direct": state,
    "Dernier test API": new Date().toISOString(),
    "Auth direct OK": readOk,
    "Lecture API OK": readOk,
  };
  if (readOk) fields["OAuth Hibou connecté"] = true;
  if (result.technical_id) fields["Identifiant technique"] = result.technical_id;
  if (error) fields["Action humaine restante"] = error.slice(0, 4000);
  await updateRecord(TABLES.socialAccounts || "tbljG9MzITNILBoHi", account.id, fields).catch(() => {});
}

export async function checkSocialAccount(providerInput, baseEnv = process.env) {
  const provider = clean(providerInput).toLowerCase();
  if (provider === "snapchat") {
    const result = { ok: false, provider, state: "NOT_CONFIGURED", error: "Snapchat Public Profile API / organic publishing access not approved" };
    await recordState(provider, result.state, {}, result.error); return result;
  }
  if (provider === "pinterest") {
    const result = await pinterestAccountCheck(baseEnv).catch((error) => ({ ok: false, provider, state: "NOT_CONFIGURED", error: String(error?.message || error) }));
    await recordState(provider, result.state, { technical_id: result.account?.username || "" }, result.error || ""); return result;
  }

  const resolved = await resolveSocialEnv(provider, baseEnv);
  const env = resolved.env || baseEnv;
  let result;
  try {
    if (provider === "youtube") {
      const token = clean(env.YOUTUBE_ACCESS_TOKEN); if (!token) throw new Error("YouTube OAuth direct non connecté");
      const r = await bearerGet("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true", token);
      const channel = r.items?.[0]; if (!channel?.id) throw new Error("YouTube: aucune chaîne autorisée");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: channel.id, profile: { id: channel.id, title: channel.snippet?.title || "", statistics: channel.statistics || {} }, credential_source: resolved.source };
    } else if (provider === "tiktok") {
      const token = clean(env.TIKTOK_ACCESS_TOKEN); if (!token) throw new Error("TikTok OAuth direct non connecté");
      const fields = "open_id,union_id,avatar_url,display_name,username,is_verified,follower_count,following_count,likes_count,video_count";
      const r = await bearerGet(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`, token);
      const user = r.data?.user || {}; if (!user.open_id && !user.union_id) throw new Error("TikTok: profil OAuth vide");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: user.open_id || user.union_id, profile: user, credential_source: resolved.source };
    } else if (provider === "linkedin") {
      const token = clean(env.LINKEDIN_ACCESS_TOKEN); if (!token) throw new Error("LinkedIn OAuth direct non connecté");
      const r = await bearerGet("https://api.linkedin.com/v2/userinfo", token);
      if (!r.sub) throw new Error("LinkedIn: userinfo sans sub");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: clean(env.LINKEDIN_AUTHOR_URN) || `urn:li:person:${r.sub}`, profile: { sub: r.sub, name: r.name || "", email_verified: r.email_verified ?? null }, credential_source: resolved.source };
    } else if (provider === "x") {
      const token = clean(env.X_ACCESS_TOKEN); if (!token) throw new Error("X OAuth direct non connecté");
      const r = await bearerGet("https://api.x.com/2/users/me?user.fields=id,name,username,public_metrics", token);
      if (!r.data?.id) throw new Error("X: profil /2/users/me vide");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: r.data.id, profile: r.data, credential_source: resolved.source };
    } else if (provider === "threads") {
      const token = clean(env.THREADS_ACCESS_TOKEN); if (!token) throw new Error("Threads OAuth direct non connecté");
      const version = clean(env.THREADS_API_VERSION) || "v1.0";
      const r = await data(await fetch(`https://graph.threads.net/${version}/me?fields=id,username&access_token=${encodeURIComponent(token)}`, { cache: "no-store" }), "Threads me");
      if (!r.id) throw new Error("Threads: profil vide");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: r.id, profile: r, credential_source: resolved.source };
    } else if (provider === "instagram") {
      const token = clean(env.META_ACCESS_TOKEN); const id = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
      if (!token || !id) throw new Error("Meta OAuth direct / Instagram Business ID non connecté");
      const version = clean(env.META_GRAPH_VERSION); const base = version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
      const r = await data(await fetch(`${base}/${encodeURIComponent(id)}?fields=id,username,name,media_count,followers_count&access_token=${encodeURIComponent(token)}`, { cache: "no-store" }), "Instagram profile");
      if (!r.id) throw new Error("Instagram: profil vide");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: r.id, profile: r, credential_source: resolved.source };
    } else if (provider === "facebook") {
      const token = clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) || clean(env.META_ACCESS_TOKEN); const id = clean(env.FACEBOOK_PAGE_ID);
      if (!token || !id) throw new Error("Meta OAuth direct / Facebook Page ID non connecté");
      const version = clean(env.META_GRAPH_VERSION); const base = version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
      const r = await data(await fetch(`${base}/${encodeURIComponent(id)}?fields=id,name,link,followers_count&access_token=${encodeURIComponent(token)}`, { cache: "no-store" }), "Facebook page");
      if (!r.id) throw new Error("Facebook: page vide");
      result = { ok: true, provider, state: "READ_TESTED", technical_id: r.id, profile: r, credential_source: resolved.source };
    } else throw new Error(`Provider non pris en charge: ${provider}`);
  } catch (error) {
    result = { ok: false, provider, state: "NOT_CONFIGURED", credential_source: resolved.source, error: String(error?.message || error).slice(0, 1000) };
  }
  await recordState(provider, result.state, result, result.error || "");
  return result;
}
