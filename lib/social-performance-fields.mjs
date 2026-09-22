function clean(value) { return String(value ?? "").trim(); }
function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const DETAIL_KEYS = [
  "score", "upvote_ratio", "quotes", "unavailable_metrics",
  "analytics_views",
  "analytics_window_days",
  "analytics_metrics",
  "media_type",
  "media_product_type",
  "credential_source",
  "privacy_level",
  "photo_count",
  "audited",
];

export function socialMetricsDetails(metrics = {}) {
  const details = {};
  for (const key of DETAIL_KEYS) {
    if (metrics?.[key] !== undefined && metrics?.[key] !== null && metrics?.[key] !== "") details[key] = metrics[key];
  }
  return details;
}

export function buildSocialPerformanceFields({ key, target = {}, metrics = null, state = "active", error = "", capturedAt = new Date().toISOString() } = {}) {
  const fields = {
    "Performance Key": clean(key),
    Provider: clean(target.provider),
    "External ID": clean(target.external_id),
    "Content Record ID": clean(target.content_record_id),
    URL: clean(metrics?.url || target.url),
    "Captured At": capturedAt,
    Status: clean(state) || "active",
    "Last Error": clean(error).slice(0, 4000),
  };

  // A failed refresh must not erase the last known good counters. When metrics is
  // null, only operational status/error fields are updated in Airtable.
  if (metrics === null || metrics === undefined) return fields;

  fields.Views = numeric(metrics.views);
  fields.Likes = numeric(metrics.likes);
  fields.Comments = numeric(metrics.comments);
  fields.Shares = numeric(metrics.shares);
  fields.Saves = numeric(metrics.saves);
  fields["Watch Time Seconds"] = numeric(metrics.watch_time_seconds);
  fields["Completion %"] = numeric(metrics.completion);
  fields.Clicks = numeric(metrics.clicks);
  fields["Followers Generated"] = numeric(metrics.followers_generated);
  fields.Reach = numeric(metrics.reach);
  fields["Total Interactions"] = numeric(metrics.total_interactions, fields.Likes + fields.Comments + fields.Shares + fields.Saves);
  fields["Average View Duration Seconds"] = numeric(metrics.average_view_duration_seconds);
  fields["Analytics Status"] = clean(metrics.analytics_status);
  const unavailable = new Set(metrics.unavailable_metrics || []);
  for (const [key, field] of Object.entries({ views: "Views", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", watch_time_seconds: "Watch Time Seconds", completion: "Completion %", clicks: "Clicks", followers_generated: "Followers Generated" })) {
    if (unavailable.has(key)) fields[field] = null;
  }
  fields["Metrics Details JSON"] = JSON.stringify(socialMetricsDetails(metrics));
  return fields;
}
