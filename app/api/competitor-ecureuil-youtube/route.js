import { NextResponse } from "next/server";
import { resolveSocialEnv } from "../../../lib/social-credentials-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TARGET = "Écureuil Finance";

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { text: text.slice(0, 1200) }; }
}
function apiError(label, response, data) {
  return {
    label,
    status: response.status,
    error: data?.error?.message || data?.error?.errors?.[0]?.reason || data?.text || response.statusText || "unknown",
  };
}
async function yt(path, params, token) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    const err = new Error(JSON.stringify(apiError(path, response, data)));
    err.status = response.status;
    throw err;
  }
  return data;
}
function parseDuration(iso = "") {
  const m = String(iso).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}
function n(value) {
  const x = Number(value || 0);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("target") !== "ecureuilfinance") {
    return NextResponse.json({ ok: false, error: "fixed_target_only" }, { status: 400 });
  }

  const resolved = await resolveSocialEnv("youtube", process.env);
  const env = resolved.env || process.env;
  const token = String(env.YOUTUBE_ACCESS_TOKEN || "").trim();
  const diagnostics = {
    target: TARGET,
    credential_source: resolved.source || "",
    scopes: resolved.scopes || "",
    has_access_token: Boolean(token),
  };
  if (!token) return NextResponse.json({ ok: false, diagnostics, error: "youtube_token_missing" }, { status: 503 });

  try {
    const channelSearch = await yt("search", {
      part: "snippet",
      type: "channel",
      q: TARGET,
      maxResults: 10,
    }, token);
    const candidates = (channelSearch.items || []).map((item) => ({
      channelId: item?.snippet?.channelId || item?.id?.channelId || "",
      title: item?.snippet?.title || "",
      description: item?.snippet?.description || "",
      publishedAt: item?.snippet?.publishedAt || "",
      thumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.default?.url || "",
    })).filter((x) => x.channelId);

    const exact = candidates.find((x) => x.title.trim().toLowerCase() === TARGET.toLowerCase());
    const chosen = exact || candidates[0] || null;
    if (!chosen) return NextResponse.json({ ok: false, diagnostics, candidates, error: "channel_not_found" }, { status: 404 });

    const channels = await yt("channels", {
      part: "snippet,statistics,contentDetails",
      id: chosen.channelId,
      maxResults: 1,
    }, token);
    const channel = channels.items?.[0];
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads || "";
    if (!uploads) return NextResponse.json({ ok: false, diagnostics, candidates, chosen, error: "uploads_playlist_missing" }, { status: 404 });

    const playlistItems = [];
    let pageToken = "";
    for (let page = 0; page < 20; page++) {
      const batch = await yt("playlistItems", {
        part: "snippet,contentDetails",
        playlistId: uploads,
        maxResults: 50,
        pageToken,
      }, token);
      playlistItems.push(...(batch.items || []));
      pageToken = batch.nextPageToken || "";
      if (!pageToken) break;
    }

    const ids = [...new Set(playlistItems.map((x) => x?.contentDetails?.videoId).filter(Boolean))];
    const videos = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = await yt("videos", {
        part: "snippet,statistics,contentDetails,status",
        id: ids.slice(i, i + 50).join(","),
        maxResults: 50,
      }, token);
      videos.push(...(batch.items || []));
    }

    const normalized = videos.map((v) => ({
      id: v.id,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      title: v?.snippet?.title || "",
      description: v?.snippet?.description || "",
      publishedAt: v?.snippet?.publishedAt || "",
      channelId: v?.snippet?.channelId || "",
      channelTitle: v?.snippet?.channelTitle || "",
      durationSeconds: parseDuration(v?.contentDetails?.duration || ""),
      viewCount: n(v?.statistics?.viewCount),
      likeCount: n(v?.statistics?.likeCount),
      commentCount: n(v?.statistics?.commentCount),
      thumbnail: v?.snippet?.thumbnails?.maxres?.url || v?.snippet?.thumbnails?.high?.url || v?.snippet?.thumbnails?.medium?.url || "",
      privacyStatus: v?.status?.privacyStatus || "",
    })).filter((v) => v.privacyStatus === "public");

    const shortForm = normalized.filter((v) => v.durationSeconds !== null && v.durationSeconds <= 180);
    const ranked = [...shortForm].sort((a, b) =>
      b.viewCount - a.viewCount || b.likeCount - a.likeCount || b.commentCount - a.commentCount
    );

    return NextResponse.json({
      ok: true,
      diagnostics,
      candidates,
      channel: {
        id: channel?.id || chosen.channelId,
        title: channel?.snippet?.title || chosen.title,
        description: channel?.snippet?.description || "",
        publishedAt: channel?.snippet?.publishedAt || "",
        subscriberCount: n(channel?.statistics?.subscriberCount),
        videoCount: n(channel?.statistics?.videoCount),
        viewCount: n(channel?.statistics?.viewCount),
        uploadsPlaylist: uploads,
      },
      catalog: {
        fetchedVideos: normalized.length,
        shortFormVideos: shortForm.length,
      },
      top50: ranked.slice(0, 50),
      next50: ranked.slice(50, 100),
      top100: ranked.slice(0, 100),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      diagnostics,
      error: String(error?.message || error).slice(0, 1200),
    }, { status: Number(error?.status) || 500, headers: { "Cache-Control": "no-store" } });
  }
}
