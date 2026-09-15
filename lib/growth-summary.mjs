function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(value) {
  return text(value?.name || value).toLowerCase();
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
