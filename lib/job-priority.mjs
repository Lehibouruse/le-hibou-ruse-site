const PRIORITY_ORDER = new Map([
  ["critical", 0],
  ["high", 1],
  ["normal", 2],
  ["low", 3],
]);

function choiceName(value) {
  if (value && typeof value === "object") return String(value.name || "");
  return String(value || "");
}

export function priorityRank(job) {
  const name = choiceName(job?.fields?.priority).trim().toLowerCase();
  return PRIORITY_ORDER.get(name) ?? PRIORITY_ORDER.get("normal");
}

function createdAt(job) {
  const value = Date.parse(job?.fields?.created_at || "");
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function orderJobsByPriority(records = []) {
  return [...records].sort((a, b) => {
    const priorityDelta = priorityRank(a) - priorityRank(b);
    if (priorityDelta !== 0) return priorityDelta;
    const createdDelta = createdAt(a) - createdAt(b);
    if (createdDelta !== 0) return createdDelta;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

export function firstPriorityJob(records = [], predicate = () => true) {
  return orderJobsByPriority(records).find(predicate) || null;
}
