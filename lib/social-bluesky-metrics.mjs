export async function fetchBlueskyMetrics(postUri, env = process.env, fetchImpl = fetch) {
  const uri = String(postUri || "").trim();
  if (!/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/?#]+$/.test(uri)) throw new Error("Bluesky : URI de publication at:// requise");
  const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts");
  url.searchParams.append("uris", uri);
  const response = await fetchImpl(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Bluesky metrics HTTP ${response.status}`);
  const data = await response.json();
  const post = data?.posts?.find((item) => item.uri === uri);
  if (!post) throw new Error("Bluesky : publication introuvable ou supprimée");
  const count = (value) => Number.isFinite(value) && value >= 0 ? value : null;
  return {
    provider: "bluesky", external_id: uri,
    likes: count(post.likeCount), comments: count(post.replyCount),
    shares: count(post.repostCount), quotes: count(post.quoteCount),
    views: null, saves: null,
    unavailable_metrics: ["views", "saves", "watch_time_seconds", "completion", "clicks", "followers_generated"],
  };
}
