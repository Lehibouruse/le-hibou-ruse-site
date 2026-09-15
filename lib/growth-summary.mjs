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

function fieldsOf(record) {
  return record?.fields || record?.cellValuesByFieldId || {};
}

function attribution(fields) {
  return {
    source: text(fields["UTM Source"]),
    campaign: text(fields.Campagne || fields.Campaign),
    content: text(fields["UTM Content"]),
  };
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
    const fields = fieldsOf(record);
    const orderStatus = status(fields.Statut);
    const refunded = orderStatus === "refunded" || Boolean(fields.Remboursement);
    const paid = orderStatus === "paid" || orderStatus === "completed" || orderStatus === "success";
    if (!paid && !refunded) continue;

    const amount = number(fields.Montant);
    const attr = attribution(fields);

    if (refunded) refunds += 1;
    else {
      paidOrders += 1;
      revenue += amount;
      if (attr.source || attr.campaign || attr.content) attributedOrders += 1;
    }

    addBucket(source, attr.source, amount, refunded);
    addBucket(campaign, attr.campaign, amount, refunded);
    addBucket(content, attr.content, amount, refunded);
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

function freshFunnelBucket(key) {
  return {
    key: text(key) || "non_attribué",
    landingSessions: new Set(),
    checkoutSessions: new Set(),
    checkoutClicks: 0,
    activeOrders: 0,
    refunds: 0,
    purchases: 0,
    grossSales: 0,
    refundedRevenue: 0,
  };
}

function bucket(map, key) {
  const name = text(key) || "non_attribué";
  if (!map.has(name)) map.set(name, freshFunnelBucket(name));
  return map.get(name);
}

function dimensionKey(fields, dimension) {
  const attr = attribution(fields);
  if (dimension === "source") return attr.source;
  if (dimension === "campaign") return attr.campaign;
  return attr.content;
}

function eventIsAttributed(fields) {
  const attr = attribution(fields);
  return Boolean(attr.source || attr.campaign || attr.content);
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

function money(value) {
  return Number(number(value).toFixed(2));
}

function finalizeFunnelMap(map) {
  return [...map.values()].map((item) => {
    const visitors = item.landingSessions.size;
    const checkoutSessions = item.checkoutSessions.size;
    const netRevenue = item.grossSales - item.refundedRevenue;
    return {
      key: item.key,
      visitors,
      checkout_sessions: checkoutSessions,
      checkout_clicks: item.checkoutClicks,
      purchases: item.purchases,
      active_orders: item.activeOrders,
      refunds: item.refunds,
      gross_sales: money(item.grossSales),
      refunded_revenue: money(item.refundedRevenue),
      net_revenue: money(netRevenue),
      visitor_to_checkout: ratio(checkoutSessions, visitors),
      visitor_to_purchase: ratio(item.purchases, visitors),
      checkout_to_purchase: ratio(item.purchases, checkoutSessions),
      revenue_per_visitor: visitors ? money(netRevenue / visitors) : 0,
      average_order_value: item.purchases ? money(item.grossSales / item.purchases) : 0,
      refund_rate: ratio(item.refunds, item.purchases),
    };
  }).sort((a, b) => b.net_revenue - a.net_revenue
    || b.purchases - a.purchases
    || b.revenue_per_visitor - a.revenue_per_visitor
    || a.key.localeCompare(b.key));
}

function dimensionFunnel(sales, events, dimension) {
  const map = new Map();
  for (const eventRecord of events) {
    const fields = fieldsOf(eventRecord);
    const event = status(fields.Event);
    if (event !== "landing" && event !== "checkout_click") continue;
    const session = text(fields["Session ID"]);
    if (!session) continue;
    const item = bucket(map, dimensionKey(fields, dimension));
    if (event === "landing") item.landingSessions.add(session);
    if (event === "checkout_click") {
      item.checkoutSessions.add(session);
      item.checkoutClicks += 1;
    }
  }

  for (const saleRecord of sales) {
    const fields = fieldsOf(saleRecord);
    const orderStatus = status(fields.Statut);
    const refunded = orderStatus === "refunded" || Boolean(fields.Remboursement);
    const paid = orderStatus === "paid" || orderStatus === "completed" || orderStatus === "success";
    if (!paid && !refunded) continue;
    const amount = number(fields.Montant);
    const item = bucket(map, dimensionKey(fields, dimension));
    item.purchases += 1;
    item.grossSales += amount;
    if (refunded) {
      item.refunds += 1;
      item.refundedRevenue += amount;
    } else {
      item.activeOrders += 1;
    }
  }
  return finalizeFunnelMap(map);
}

export function funnelSummary(sales = [], events = []) {
  const attributedEvents = events.filter((record) => eventIsAttributed(fieldsOf(record)));
  const landingSessions = new Set();
  const checkoutSessions = new Set();
  let checkoutClicks = 0;

  for (const record of attributedEvents) {
    const fields = fieldsOf(record);
    const event = status(fields.Event);
    const session = text(fields["Session ID"]);
    if (!session) continue;
    if (event === "landing") landingSessions.add(session);
    if (event === "checkout_click") {
      checkoutSessions.add(session);
      checkoutClicks += 1;
    }
  }

  let purchases = 0;
  let refunds = 0;
  let grossSales = 0;
  let refundedRevenue = 0;
  let attributedPurchases = 0;
  for (const record of sales) {
    const fields = fieldsOf(record);
    const orderStatus = status(fields.Statut);
    const refunded = orderStatus === "refunded" || Boolean(fields.Remboursement);
    const paid = orderStatus === "paid" || orderStatus === "completed" || orderStatus === "success";
    if (!paid && !refunded) continue;
    purchases += 1;
    const amount = number(fields.Montant);
    grossSales += amount;
    if (refunded) {
      refunds += 1;
      refundedRevenue += amount;
    }
    const attr = attribution(fields);
    if (attr.source || attr.campaign || attr.content) attributedPurchases += 1;
  }

  const visitors = landingSessions.size;
  const checkoutVisitors = checkoutSessions.size;
  const netRevenue = grossSales - refundedRevenue;
  return {
    attributed_visitors: visitors,
    attributed_checkout_sessions: checkoutVisitors,
    checkout_clicks: checkoutClicks,
    purchases,
    refunds,
    attributed_purchases: attributedPurchases,
    gross_sales: money(grossSales),
    refunded_revenue: money(refundedRevenue),
    net_revenue: money(netRevenue),
    visitor_to_checkout: ratio(checkoutVisitors, visitors),
    visitor_to_purchase: ratio(attributedPurchases, visitors),
    checkout_to_purchase: ratio(attributedPurchases, checkoutVisitors),
    revenue_per_attributed_visitor: visitors ? money(netRevenue / visitors) : 0,
    refund_rate: ratio(refunds, purchases),
    purchase_attribution_rate: ratio(attributedPurchases, purchases),
    by_source: dimensionFunnel(sales, events, "source"),
    by_campaign: dimensionFunnel(sales, events, "campaign"),
    by_content: dimensionFunnel(sales, events, "content"),
  };
}
