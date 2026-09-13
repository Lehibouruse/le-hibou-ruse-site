export const DEFAULT_RESERVED_JOB_IDS = [
  "hibou-site-finalisation-20260913-1317",
  "hibou-video-launch-20260913-1317",
];

function escapeFormulaString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function reservedJobIds(env = process.env) {
  const configured = String(env.HIBOU_RESERVED_JOB_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_RESERVED_JOB_IDS, ...configured])];
}

export function eligibleJobsFormula(env = process.env, options = {}) {
  const eligible = "OR({status}='Pending',AND({status}='Retry',OR({next_run_at}=BLANK(),{next_run_at}<=NOW())),AND({status}='Running',{lease_expires_at}!=BLANK(),{lease_expires_at}<=NOW()))";
  if (options.includeReserved === true) return eligible;
  const exclusions = reservedJobIds(env)
    .map((jobId) => `{job_id}='${escapeFormulaString(jobId)}'`)
    .join(",");
  return exclusions ? `AND(${eligible},NOT(OR(${exclusions})))` : eligible;
}
