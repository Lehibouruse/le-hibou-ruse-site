function text(value) {
  return String(value?.name ?? value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fieldsOf(record) {
  return record?.fields || record?.cellValuesByFieldId || {};
}

function metricKey(provider, contentId) {
  const network = lower(provider);
  const content = text(contentId);
  return network && content ? `${network}|${content}` : "";
}

function money(value) {
  return Number(number(value).toFixed(2));
}

function perThousand(value, views) {
  return views > 0 ? Number(((number(value) / views) * 1000).toFixed(4)) : 0;
}

function ratio(value, denominator) {
  return denominator > 0 ? Number((number(value) / denominator).toFixed(4)) : 0;
}

function ensure(map, provider, contentId) {
  const key = metricKey(provider, contentId);
  if (!key) return null;
  if (!map.has(key)) {
    map.set(key, {
      key,
      provider: lower(provider),
      content_id: text(contentId),
      views: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      engagements: 0,
      purchases: 0,
      refunds: 0,
      gross_sales: 0,
      refunded_revenue: 0,
      external_ids: new Set(),
    });
  }
  return map.get(key);
}

export function contentEfficiencySummary(sales = [], performances = []) {
  const map = new Map();

  for (const record of performances) {
    const fields = fieldsOf(record);
    const row = ensure(map, fields.Provider, fields["Content Record ID"]);
    if (!row) continue;
    const views = Math.max(0, number(fields.Views));
    const reach = Math.max(0, number(fields.Reach));
    const likes = Math.max(0, number(fields.Likes));
    const comments = Math.max(0, number(fields.Comments));
    const shares = Math.max(0, number(fields.Shares));
    const saves = Math.max(0, number(fields.Saves));
    const hasNativeInteractions = Object.prototype.hasOwnProperty.call(fields, "Total Interactions")
      && fields["Total Interactions"] !== null
      && fields["Total Interactions"] !== "";
    const interactions = hasNativeInteractions
      ? Math.max(0, number(fields["Total Interactions"]))
      : likes + comments + shares + saves;

    row.views += views;
    row.reach += reach;
    row.likes += likes;
    row.comments += comments;
    row.shares += shares;
    row.saves += saves;
    row.engagements += interactions;
    const externalId = text(fields["External ID"]);
    if (externalId) row.external_ids.add(externalId);
  }

  for (const record of sales) {
    const fields = fieldsOf(record);
    const provider = fields["UTM Source"];
    const contentId = fields["UTM Content"];
    const row = ensure(map, provider, contentId);
    if (!row) continue;

    const orderStatus = lower(fields.Statut);
    const refunded = orderStatus === "refunded" || Boolean(fields.Remboursement);
    const paid = refunded || ["paid", "completed", "success"].includes(orderStatus);
    if (!paid) continue;

    const amount = Math.max(0, number(fields.Montant));
    row.purchases += 1;
    row.gross_sales += amount;
    if (refunded) {
      row.refunds += 1;
      row.refunded_revenue += amount;
    }
  }

  const rows = [...map.values()].map((row) => {
    const netRevenue = row.gross_sales - row.refunded_revenue;
    return {
      key: row.key,
      provider: row.provider,
      content_id: row.content_id,
      external_ids: [...row.external_ids],
      views: Math.round(row.views),
      reach: Math.round(row.reach),
      likes: Math.round(row.likes),
      comments: Math.round(row.comments),
      shares: Math.round(row.shares),
      saves: Math.round(row.saves),
      engagements: Math.round(row.engagements),
      purchases: row.purchases,
      refunds: row.refunds,
      gross_sales: money(row.gross_sales),
      refunded_revenue: money(row.refunded_revenue),
      net_revenue: money(netRevenue),
      purchases_per_1000_views: perThousand(row.purchases, row.views),
      revenue_per_1000_views: perThousand(netRevenue, row.views),
      engagement_rate: ratio(row.engagements, row.views),
      engagement_rate_reach: ratio(row.engagements, row.reach),
      purchase_rate_reach: ratio(row.purchases, row.reach),
      refund_rate: ratio(row.refunds, row.purchases),
    };
  });

  return rows.sort((a, b) =>
    b.net_revenue - a.net_revenue
    || b.revenue_per_1000_views - a.revenue_per_1000_views
    || b.views - a.views
    || a.key.localeCompare(b.key));
}

export function providerEfficiencySummary(rows = []) {
  const providers = new Map();
  for (const row of rows) {
    const provider = lower(row.provider) || "non_attribué";
    const current = providers.get(provider) || {
      provider,
      views: 0,
      reach: 0,
      engagements: 0,
      purchases: 0,
      refunds: 0,
      net_revenue: 0,
    };
    current.views += number(row.views);
    current.reach += number(row.reach);
    current.engagements += number(row.engagements);
    current.purchases += number(row.purchases);
    current.refunds += number(row.refunds);
    current.net_revenue += number(row.net_revenue);
    providers.set(provider, current);
  }

  return [...providers.values()].map((row) => ({
    ...row,
    views: Math.round(row.views),
    reach: Math.round(row.reach),
    engagements: Math.round(row.engagements),
    purchases: Math.round(row.purchases),
    refunds: Math.round(row.refunds),
    net_revenue: money(row.net_revenue),
    purchases_per_1000_views: perThousand(row.purchases, row.views),
    revenue_per_1000_views: perThousand(row.net_revenue, row.views),
    engagement_rate: ratio(row.engagements, row.views),
    engagement_rate_reach: ratio(row.engagements, row.reach),
    purchase_rate_reach: ratio(row.purchases, row.reach),
  })).sort((a, b) => b.net_revenue - a.net_revenue || b.revenue_per_1000_views - a.revenue_per_1000_views || b.views - a.views);
}
