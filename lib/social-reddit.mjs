const clean = (value) => String(value ?? "").trim();

export const REDDIT_CALLBACK_PATH = "/api/social/oauth/reddit/callback";

export function requireRedditApproval(env = process.env) {
  if (clean(env.REDDIT_API_APPROVED).toLowerCase() !== "true") {
    throw new Error("Reddit : approbation API commerciale requise avant OAuth, lecture ou publication (REDDIT_API_APPROVED).");
  }
}

function required(env, name) {
  const value = clean(env[name]);
  if (!value) throw new Error(`${name} absent`);
  return value;
}

export function redditOAuthConfig(env = process.env) {
  requireRedditApproval(env);
  return {
    provider: "reddit",
    clientId: required(env, "REDDIT_CLIENT_ID"),
    clientSecret: required(env, "REDDIT_CLIENT_SECRET"),
    authorizeUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    scopes: clean(env.REDDIT_OAUTH_SCOPES) || "identity read submit",
    userAgent: required(env, "REDDIT_USER_AGENT"),
  };
}

async function responseJson(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(`${label} HTTP ${response.status}${data.error === "invalid_grant" ? " : invalid_grant" : ""}`);
    error.status = response.ok ? 400 : response.status;
    throw error;
  }
  return data;
}

export async function redditToken(fields, env = process.env, fetchImpl = fetch) {
  const cfg = redditOAuthConfig(env);
  const response = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "User-Agent": cfg.userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  const token = await responseJson(response, "Reddit OAuth");
  if (!clean(token.access_token) || clean(token.token_type).toLowerCase() !== "bearer" || !(Number(token.expires_in) > 0)) {
    throw new Error("Reddit OAuth : réponse de jeton incomplète");
  }
  return token;
}

function apiOptions(env) {
  requireRedditApproval(env);
  return {
    headers: {
      Authorization: `Bearer ${required(env, "REDDIT_ACCESS_TOKEN")}`,
      "User-Agent": required(env, "REDDIT_USER_AGENT"),
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  };
}

export async function redditIdentity(env = process.env, fetchImpl = fetch) {
  const data = await responseJson(
    await fetchImpl("https://oauth.reddit.com/api/v1/me", apiOptions(env)),
    "Reddit identity",
  );
  if (!clean(data.id) || !/^[A-Za-z0-9_-]+$/.test(clean(data.name))) {
    throw new Error("Reddit : identité authentifiée absente");
  }
  const expected = clean(env.REDDIT_EXPECTED_USERNAME);
  if (expected && clean(data.name).toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Reddit : le compte autorisé ne correspond pas au compte Hibou attendu");
  }
  return {
    technicalId: data.id,
    publicId: data.name,
    profileUrl: `https://www.reddit.com/user/${encodeURIComponent(data.name)}/`,
  };
}

export async function fetchRedditMetrics(postId, env = process.env, fetchImpl = fetch) {
  const id = clean(postId);
  if (!/^t3_[a-z0-9]+$/i.test(id)) throw new Error("Reddit : external_id t3_ requis");
  const data = await responseJson(
    await fetchImpl(`https://oauth.reddit.com/api/info?id=${encodeURIComponent(id)}`, apiOptions(env)),
    "Reddit metrics",
  );
  const post = data?.data?.children?.find((item) => item.kind === "t3" && item.data?.name === id)?.data;
  if (!post) throw new Error("Reddit : publication introuvable ou inaccessible");
  return {
    provider: "reddit",
    external_id: id,
    url: `https://www.reddit.com/comments/${id.slice(3)}/`,
    comments: Number.isFinite(post.num_comments) ? post.num_comments : null,
    score: Number.isFinite(post.score) ? post.score : null,
    upvote_ratio: Number.isFinite(post.upvote_ratio) ? post.upvote_ratio : null,
    views: null,
    likes: null,
    shares: null,
    saves: null,
    watch_time_seconds: null,
    completion: null,
    clicks: null,
    followers_generated: null,
    unavailable_metrics: ["views", "likes", "shares", "saves", "watch_time_seconds", "completion", "clicks", "followers_generated"],
  };
}

export async function dispatchReddit(payload, env = process.env, fetchImpl = fetch) {
  const options = apiOptions(env);
  const subreddit = required(env, "REDDIT_SUBREDDIT").replace(/^r\//, "");
  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) throw new Error("REDDIT_SUBREDDIT invalide");
  const title = clean(payload.title);
  if (!title || title.length > 300) throw new Error("Reddit : titre requis, 300 caractères maximum");
  const link = clean(payload.metadata?.reddit_url || payload.media_url);
  if (link) {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Reddit : le lien doit être HTTPS sans identifiants");
  } else if (!clean(payload.caption)) {
    throw new Error("Reddit : texte ou lien requis");
  }
  const body = new URLSearchParams({
    api_type: "json",
    sr: subreddit,
    title,
    kind: link ? "link" : "self",
    resubmit: "false",
    sendreplies: "false",
    ...(link ? { url: link } : { text: clean(payload.caption) }),
  });
  const data = await responseJson(
    await fetchImpl("https://oauth.reddit.com/api/submit", {
      ...options,
      method: "POST",
      headers: { ...options.headers, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    "Reddit publication",
  );
  const errors = data?.json?.errors;
  if (Array.isArray(errors) && errors.length) throw new Error("Reddit : publication refusée ; vérifier règles, flair et limites du subreddit");
  const post = data?.json?.data;
  if (!/^t3_[a-z0-9]+$/i.test(clean(post?.name))) throw new Error("Reddit : identifiant de publication absent");
  return {
    provider: "reddit",
    post_id: post.name,
    url: `https://www.reddit.com/comments/${post.name.slice(3)}/`,
    subreddit,
  };
}
