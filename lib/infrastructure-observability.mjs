const HEALTH_KEYS = ["system_health_status", "system_health_checked_at", "system_health_report"];
const DEFAULT_STALE_MS = 30 * 60 * 1000;
const REPO = "Lehibouruse/le-hibou-ruse-site";

function text(value) { return String(value ?? "").trim(); }
function json(value, fallback = {}) { try { return JSON.parse(text(value) || "{}"); } catch { return fallback; } }
function dateMs(value) { const ms = Date.parse(text(value)); return Number.isFinite(ms) ? ms : 0; }

function safeAction(item = {}) {
  return {
    action: text(item.action).slice(0, 120),
    ...(text(item.provider) ? { provider: text(item.provider).slice(0, 60) } : {}),
    ...(text(item.state) ? { state: text(item.state).slice(0, 80) } : {}),
    ...(typeof item.changed === "boolean" ? { changed: item.changed } : {}),
    ...(typeof item.ok === "boolean" ? { ok: item.ok } : {}),
  };
}

export function systemHealthConfigValues(snapshot = {}, circuit = {}, checkedAt = new Date().toISOString(), actions = []) {
  const safeIssues = (snapshot.issues || []).slice(0, 20).map((item) => ({
    severity: text(item.severity).slice(0, 20),
    code: text(item.code).slice(0, 120),
    count: Math.max(0, Number(item.count || 0)),
  }));
  const safeCounts = Object.fromEntries(Object.entries(snapshot.counts || {}).slice(0, 50).map(([key, value]) => [text(key).slice(0, 100), Number(value || 0)]));
  const safeBlockers = (snapshot.launch_blockers || []).slice(0, 20).map((item) => text(item?.key || item).slice(0, 160)).filter(Boolean);
  const report = {
    version: 1,
    checked_at: checkedAt,
    severity: ["ok", "degraded", "critical"].includes(snapshot.severity) ? snapshot.severity : "unknown",
    ok: snapshot.ok === true,
    counts: safeCounts,
    issues: safeIssues,
    last_actions: (actions || []).slice(-10).map(safeAction).filter((item) => item.action),
    launch_ready: snapshot.launch_ready === true,
    launch_blockers: safeBlockers,
    openai: {
      circuit_active: circuit.active === true,
      circuit_until: text(circuit.until).slice(0, 64),
      credit_paused: circuit.active === true,
    },
  };
  return {
    system_health_status: report.severity,
    system_health_checked_at: checkedAt,
    system_health_report: JSON.stringify(report),
  };
}

export function systemHealthHeartbeat(config = {}, now = Date.now(), staleMs = DEFAULT_STALE_MS) {
  const status = text(config.system_health_status).toLowerCase();
  const checkedAt = text(config.system_health_checked_at);
  const checkedMs = dateMs(checkedAt);
  const ageMs = checkedMs ? Math.max(0, now - checkedMs) : null;
  const report = json(config.system_health_report, {});
  const stale = !checkedMs || ageMs > staleMs;
  return {
    known: Boolean(checkedMs && ["ok", "degraded", "critical"].includes(status)),
    stale,
    status: stale ? "stale" : (["ok", "degraded", "critical"].includes(status) ? status : "unknown"),
    last_status: ["ok", "degraded", "critical"].includes(status) ? status : "unknown",
    checked_at: checkedAt,
    age_ms: ageMs,
    report: report && typeof report === "object" ? report : {},
  };
}

export function healthConfigDescriptions() {
  return {
    system_health_status: "Dernière sévérité réelle calculée par HIBOU_SYSTEM_WATCHDOG_V1. Diagnostic non sensible.",
    system_health_checked_at: "Dernier heartbeat réussi du watchdog système. Un heartbeat trop ancien doit être considéré comme stale.",
    system_health_report: "Snapshot compact non sensible du Core : compteurs, codes d'incident, dernières réconciliations, circuit OpenAI et readiness. Aucun token ni secret.",
  };
}

export function healthConfigKeys() { return [...HEALTH_KEYS]; }

function vercelState(statuses = []) {
  const vercel = statuses.filter((item) => /vercel/i.test(text(item?.context)));
  if (!vercel.length) return "unknown";
  if (vercel.some((item) => text(item?.state) === "failure" || text(item?.state) === "error")) return "failure";
  if (vercel.some((item) => text(item?.state) === "pending")) return "pending";
  if (vercel.some((item) => text(item?.state) === "success")) return "success";
  return "unknown";
}

async function githubJson(fetchImpl, path, timeoutMs) {
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Hibou-Infrastructure-Observability/1.0" },
    cache: "no-store",
    signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
}

export async function githubInfrastructureStatus(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const timeoutMs = Math.max(500, Math.min(10_000, Number(options.timeoutMs || 4000)));
  try {
    const main = await githubJson(fetchImpl, "/commits/main", timeoutMs);
    const mainSha = text(main?.sha);
    if (!/^[a-f0-9]{40}$/i.test(mainSha)) throw new Error("GitHub main SHA invalide");
    const [runs, combined] = await Promise.all([
      githubJson(fetchImpl, "/actions/workflows/ci.yml/runs?branch=main&per_page=1", timeoutMs),
      githubJson(fetchImpl, `/commits/${mainSha}/status`, timeoutMs),
    ]);
    const latest = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs[0] : null;
    const deployedSha = text(env.VERCEL_GIT_COMMIT_SHA);
    const ciStatus = text(latest?.status) || "unknown";
    const ciConclusion = text(latest?.conclusion) || (ciStatus === "completed" ? "unknown" : "pending");
    return {
      known: true,
      github_main_sha: mainSha,
      github_main_short: mainSha.slice(0, 8),
      ci: {
        status: ciStatus,
        conclusion: ciConclusion,
        run_id: latest?.id || null,
        updated_at: text(latest?.updated_at),
        head_sha: text(latest?.head_sha),
        aligned_with_main: Boolean(latest?.head_sha && text(latest.head_sha) === mainSha),
      },
      vercel: {
        status: vercelState(combined?.statuses || []),
        deployed_sha: deployedSha,
        deployed_short: /^[a-f0-9]{40}$/i.test(deployedSha) ? deployedSha.slice(0, 8) : "",
        aligned_with_main: /^[a-f0-9]{40}$/i.test(deployedSha) ? deployedSha === mainSha : null,
      },
      error: "",
    };
  } catch (error) {
    return {
      known: false,
      github_main_sha: "",
      github_main_short: "",
      ci: { status: "unknown", conclusion: "unknown", run_id: null, updated_at: "", head_sha: "", aligned_with_main: null },
      vercel: { status: "unknown", deployed_sha: text(env.VERCEL_GIT_COMMIT_SHA), deployed_short: "", aligned_with_main: null },
      error: text(error?.message || error).slice(0, 300),
    };
  }
}
