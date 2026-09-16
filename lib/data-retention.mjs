const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DAYS = Object.freeze({
  conversion_events: 13 * 30,
  automation_logs: 365,
  prospects: 3 * 365,
});

function text(value) { return String(value ?? "").trim(); }

export function dateMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordDate(record, fieldName) {
  return dateMs(record?.fields?.[fieldName]) || dateMs(record?.createdTime);
}

function ageDays(at, now) {
  if (!at) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

function classifyByAge(record, fieldName, maxDays, now) {
  const at = recordDate(record, fieldName);
  if (!at) return { status: "invalid_date", at: 0, age_days: null };
  const age = ageDays(at, now);
  return {
    status: age > maxDays ? "candidate_for_purge" : "keep",
    at,
    age_days: age,
  };
}

export function classifyConversionEvent(record, now = Date.now()) {
  return classifyByAge(record, "Occurred At", RETENTION_DAYS.conversion_events, now);
}

export function classifyAutomationLog(record, now = Date.now()) {
  return classifyByAge(record, "Dernière exécution", RETENTION_DAYS.automation_logs, now);
}

export function classifyProspect(record, now = Date.now()) {
  return classifyByAge(record, "Date", RETENTION_DAYS.prospects, now);
}

export function classifySale(record, now = Date.now()) {
  const at = recordDate(record, "Date");
  return {
    status: "legal_archive",
    at,
    age_days: ageDays(at, now),
  };
}

function summarize(records, classifier, now) {
  const counts = { keep: 0, candidate_for_purge: 0, legal_archive: 0, invalid_date: 0 };
  let oldestAt = 0;
  let newestAt = 0;
  for (const record of records || []) {
    const result = classifier(record, now);
    counts[result.status] = (counts[result.status] || 0) + 1;
    if (result.at) {
      oldestAt = oldestAt ? Math.min(oldestAt, result.at) : result.at;
      newestAt = Math.max(newestAt, result.at);
    }
  }
  return {
    total: (records || []).length,
    counts,
    oldest_at: oldestAt ? new Date(oldestAt).toISOString() : null,
    newest_at: newestAt ? new Date(newestAt).toISOString() : null,
  };
}

export function retentionAudit({ conversionEvents = [], automationLogs = [], prospects = [], sales = [], now = Date.now() } = {}) {
  return {
    mode: "read_only",
    destructive_actions: false,
    policy_days: RETENTION_DAYS,
    conversion_events: summarize(conversionEvents, classifyConversionEvent, now),
    automation_logs: summarize(automationLogs, classifyAutomationLog, now),
    prospects: summarize(prospects, classifyProspect, now),
    sales: summarize(sales, classifySale, now),
  };
}
