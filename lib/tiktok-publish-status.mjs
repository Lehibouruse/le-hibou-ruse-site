function clean(value) {
  return String(value ?? "").trim();
}

function finalStatus(value) {
  const status = clean(value).toUpperCase();
  return status === "PUBLISH_COMPLETE" || status === "FAILED";
}

function normalizePostIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
}

export function normalizeTikTokPublishStatus(payload = {}, publishId = "") {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const status = clean(data?.status).toUpperCase();
  const postIds = normalizePostIds(data?.publicaly_available_post_id || data?.publicly_available_post_id || data?.post_ids);
  return {
    provider: "tiktok",
    publish_id: clean(publishId || data?.publish_id),
    status,
    complete: status === "PUBLISH_COMPLETE",
    failed: status === "FAILED",
    final: finalStatus(status),
    fail_reason: clean(data?.fail_reason),
    post_ids: postIds,
    post_id: postIds[0] || "",
    uploaded_bytes: Number(data?.uploaded_bytes || 0) || 0,
    downloaded_bytes: Number(data?.downloaded_bytes || 0) || 0,
  };
}

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
    const error = new Error(`TikTok publish status ${response.status}: ${String(detail).slice(0, 600)}`);
    error.status = response.status;
    if ([401, 403].includes(response.status)) error.code = "needs_reauth";
    throw error;
  }
  if (data?.error?.code && data.error.code !== "ok") {
    const error = new Error(`TikTok publish status: ${data.error.code}${data.error.message ? ` · ${data.error.message}` : ""}`);
    error.code = data.error.code;
    throw error;
  }
  return data;
}

export async function fetchTikTokPublishStatus(publishId, accessToken, fetchImpl = fetch) {
  const id = clean(publishId);
  const token = clean(accessToken);
  if (!id) throw new Error("TikTok publish_id absent");
  if (!token) throw new Error("TikTok access token absent");
  const response = await fetchImpl("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: id }),
    cache: "no-store",
  });
  return normalizeTikTokPublishStatus(await responseJson(response), id);
}

export async function pollTikTokPublishStatus(publishId, accessToken, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = Math.max(1, Math.min(30, Number(options.attempts || 8)));
  const intervalMs = Math.max(250, Math.min(10_000, Number(options.intervalMs || 2000)));
  let status = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    status = await fetchTikTokPublishStatus(publishId, accessToken, fetchImpl);
    status.attempt = attempt;
    if (status.final) return status;
    if (attempt < attempts) await sleep(intervalMs);
  }
  return { ...status, final: false, polling_exhausted: true };
}
