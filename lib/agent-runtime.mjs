export function failureDisposition(fields = {}, nowMs = Date.now()) {
  const retryCount = Math.max(0, Number(fields.retry_count || 0));
  const maxRetries = Math.max(0, Math.min(5, Number(fields.max_retries ?? 2)));
  if (retryCount < maxRetries) {
    const delaySeconds = Math.min(1800, 60 * (2 ** retryCount));
    return {
      status: "Retry",
      retry_count: retryCount + 1,
      next_run_at: new Date(nowMs + delaySeconds * 1000).toISOString(),
      completed_at: null,
    };
  }
  return { status: "Error", retry_count: retryCount, next_run_at: null, completed_at: new Date(nowMs).toISOString() };
}

export function vercelCommitState(statuses = [], checkRuns = []) {
  const modern = checkRuns.find((check) => {
    const name = String(check?.name || "").toLowerCase();
    const app = String(check?.app?.slug || check?.app?.name || "").toLowerCase();
    return name.includes("vercel") || app.includes("vercel");
  });
  if (modern) {
    if (modern.status !== "completed") return "pending";
    if (["success", "neutral", "skipped"].includes(String(modern.conclusion || "").toLowerCase())) return "success";
    if (modern.conclusion) return "failure";
  }
  const legacy = statuses.find((status) => String(status.context || "").toLowerCase() === "vercel");
  if (!legacy) return "pending";
  if (legacy.state === "success") return "success";
  if (["failure", "error"].includes(legacy.state)) return "failure";
  return "pending";
}
