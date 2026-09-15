function clean(value) {
  return String(value ?? "").trim();
}

function amount(record) {
  const value = Number(record?.fields?.Montant || 0);
  return Number.isFinite(value) ? value : 0;
}

function status(record) {
  return clean(record?.fields?.Statut).toLowerCase();
}

function isTest(record) {
  return /(?:^|;\s*)test_mode=true(?:;|$)/i.test(clean(record?.fields?.Notes));
}

function realSale(record) {
  if (isTest(record)) return false;
  const state = status(record);
  return ["paid", "refunded", "completed", "delivered"].includes(state);
}

function attributed(record) {
  const fields = record?.fields || {};
  return Boolean(clean(fields["UTM Source"] || fields.Provenance) || clean(fields.Campagne) || clean(fields["UTM Content"]));
}

function key(value, fallback = "non attribué") {
  return clean(value) || fallback;
}

function addGroup(map, groupKey, record) {
  const name = key(groupKey);
  const current = map.get(name) || {
    key: name,
    orders: 0,
    paid_orders: 0,
    refunded_orders: 0,
    gross_revenue: 0,
    refunded_revenue: 0,
    net_revenue: 0,
  };
  const value = amount(record);
  const state = status(record);
  current.orders += 1;
  if (state === "refunded") {
    current.refunded_orders += 1;
    current.gross_revenue += value;
    current.refunded_revenue += value;
  } else {
    current.paid_orders += 1;
    current.gross_revenue += value;
    current.net_revenue += value;
  }
  map.set(name, current);
}

function ranked(map) {
  return [...map.values()]
    .map((item) => ({
      ...item,
      refund_rate: item.orders ? item.refunded_orders / item.orders : 0,
      average_order_value: item.paid_orders ? item.net_revenue / item.paid_orders : 0,
    }))
    .sort((a, b) => b.net_revenue - a.net_revenue || b.paid_orders - a.paid_orders || a.key.localeCompare(b.key));
}

export function growthSnapshot(records = []) {
  const source = new Map();
  const campaign = new Map();
  const content = new Map();
  const valid = records.filter(realSale);

  let paidOrders = 0;
  let refundedOrders = 0;
  let grossRevenue = 0;
  let refundedRevenue = 0;
  let netRevenue = 0;
  let attributedOrders = 0;

  for (const record of valid) {
    const fields = record.fields || {};
    const value = amount(record);
    const state = status(record);
    if (state === "refunded") {
      refundedOrders += 1;
      grossRevenue += value;
      refundedRevenue += value;
    } else {
      paidOrders += 1;
      grossRevenue += value;
      netRevenue += value;
    }
    if (attributed(record)) attributedOrders += 1;

    const sourceKey = fields["UTM Source"] || (fields.Provenance === "Lemon Squeezy" ? "direct" : fields.Provenance);
    const campaignKey = fields.Campagne;
    const contentKey = fields["UTM Content"];
    addGroup(source, sourceKey, record);
    addGroup(campaign, campaignKey, record);
    addGroup(content, contentKey, record);
  }

  const totalOrders = paidOrders + refundedOrders;
  return {
    generated_at: new Date().toISOString(),
    total_orders: totalOrders,
    paid_orders: paidOrders,
    refunded_orders: refundedOrders,
    gross_revenue: grossRevenue,
    refunded_revenue: refundedRevenue,
    net_revenue: netRevenue,
    average_order_value: paidOrders ? netRevenue / paidOrders : 0,
    refund_rate: totalOrders ? refundedOrders / totalOrders : 0,
    attributed_orders: attributedOrders,
    attribution_rate: totalOrders ? attributedOrders / totalOrders : 0,
    by_source: ranked(source),
    by_campaign: ranked(campaign),
    by_content: ranked(content),
  };
}

export function topGrowthSignals(snapshot, limit = 5) {
  const take = (items) => (items || []).filter((item) => item.key !== "non attribué").slice(0, limit);
  return {
    sources: take(snapshot?.by_source),
    campaigns: take(snapshot?.by_campaign),
    contents: take(snapshot?.by_content),
  };
}
