function text(value) {
  return String(value?.name || value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(value) {
  return text(value).toLowerCase();
}

function addBucket(map, key, amount, refunded) {
  const name = text(key) || "non_attribué";
  const current = map.get(name) || { key: name, orders: 0, refunds: 0, revenue: 0 };
  if (refunded) current.refunds += 1;
  else {
    current.orders += 1;
    current.revenue += amount;
  }
  map.set(name, current);
}

function ranked(map) {
  return [...map.values()]
    .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.key.localeCompare(b.key));
}

export function growthSummary(records = []) {
  const source = new Map();
  const campaign = new Map();
  const content = new Map();
  let paidOrders = 0;
  let refunds = 0;
  let revenue = 0;
  let attributedOrders = 0;

  for (const record of records) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const orderStatus = status(fields.Statut);
    const refunded = orderStatus === "refunded" || Boolean(fields.Remboursement);
    const paid = orderStatus === "paid" || orderStatus === "completed" || orderStatus === "success";
    if (!paid && !refunded) continue;

    const amount = number(fields.Montant);
    const utmSource = text(fields["UTM Source"] || fields.Provenance);
    const utmCampaign = text(fields.Campagne);
    const utmContent = text(fields["UTM Content"]);

    if (refunded) refunds += 1;
    else {
      paidOrders += 1;
      revenue += amount;
      if (utmSource || utmCampaign || utmContent) attributedOrders += 1;
    }

    addBucket(source, utmSource, amount, refunded);
    addBucket(campaign, utmCampaign, amount, refunded);
    addBucket(content, utmContent, amount, refunded);
  }

  return {
    paid_orders: paidOrders,
    refunds,
    gross_revenue: Number(revenue.toFixed(2)),
    attributed_orders: attributedOrders,
    attribution_rate: paidOrders ? Number((attributedOrders / paidOrders).toFixed(4)) : 0,
    by_source: ranked(source),
    by_campaign: ranked(campaign),
    by_content: ranked(content),
  };
}

export function conversionSummary(records = []) {
  const landingSessions = new Set();
  const checkoutSessions = new Set();
  let landings = 0;
  let checkoutClicks = 0;
  for (const record of records) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const event = text(fields.Event).toLowerCase();
    const session = text(fields["Session ID"]);
    if (event === "landing") {
      landings += 1;
      if (session) landingSessions.add(session);
    }
    if (event === "checkout_click") {
      checkoutClicks += 1;
      if (session) checkoutSessions.add(session);
    }
  }
  return {
    landings,
    checkout_clicks: checkoutClicks,
    unique_sessions: landingSessions.size,
    checkout_sessions: checkoutSessions.size,
    landing_to_checkout_rate: landingSessions.size ? Number((checkoutSessions.size / landingSessions.size).toFixed(4)) : 0,
  };
}

export function socialPerformanceSummary(records = []) {
  let views = 0;
  let clicks = 0;
  let watchTime = 0;
  const providers = new Map();
  for (const record of records) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const provider = text(fields.Provider) || "unknown";
    const row = providers.get(provider) || { provider, views: 0, clicks: 0, likes: 0, comments: 0, shares: 0, saves: 0, watch_time_seconds: 0 };
    row.views += number(fields.Views);
    row.clicks += number(fields.Clicks);
    row.likes += number(fields.Likes);
    row.comments += number(fields.Comments);
    row.shares += number(fields.Shares);
    row.saves += number(fields.Saves);
    row.watch_time_seconds += number(fields["Watch Time Seconds"]);
    providers.set(provider, row);
    views += number(fields.Views);
    clicks += number(fields.Clicks);
    watchTime += number(fields["Watch Time Seconds"]);
  }
  return { views, clicks, watch_time_seconds: watchTime, by_provider: [...providers.values()].sort((a, b) => b.views - a.views) };
}

function funnelRow(map, key) {
  const normalized = text(key);
  if (!normalized) return null;
  if (!map.has(normalized)) map.set(normalized, { key: normalized, views: 0, social_clicks: 0, landings: 0, checkout_clicks: 0, orders: 0, revenue: 0 });
  return map.get(normalized);
}

export function contentFunnel(sales = [], events = [], performance = []) {
  const map = new Map();
  for (const record of performance) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const row = funnelRow(map, fields["Content Record ID"]);
    if (!row) continue;
    row.views += number(fields.Views);
    row.social_clicks += number(fields.Clicks);
  }
  for (const record of events) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const row = funnelRow(map, fields["UTM Content"]);
    if (!row) continue;
    const event = text(fields.Event).toLowerCase();
    if (event === "landing") row.landings += 1;
    if (event === "checkout_click") row.checkout_clicks += 1;
  }
  for (const record of sales) {
    const fields = record?.fields || record?.cellValuesByFieldId || {};
    const orderStatus = status(fields.Statut);
    if (!["paid", "completed", "success"].includes(orderStatus) || fields.Remboursement) continue;
    const row = funnelRow(map, fields["UTM Content"]);
    if (!row) continue;
    row.orders += 1;
    row.revenue += number(fields.Montant);
  }
  return [...map.values()].map((row) => ({
    ...row,
    revenue: Number(row.revenue.toFixed(2)),
    visit_to_purchase_rate: row.landings ? Number((row.orders / row.landings).toFixed(4)) : 0,
    checkout_to_purchase_rate: row.checkout_clicks ? Number((row.orders / row.checkout_clicks).toFixed(4)) : 0,
    revenue_per_1000_views: row.views ? Number((row.revenue * 1000 / row.views).toFixed(2)) : 0,
  })).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || b.landings - a.landings || b.views - a.views);
}
