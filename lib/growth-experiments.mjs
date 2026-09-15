const CONTENT_MIN_VIEWS = 1000;
const VIRAL_MIN_VIEWS = 5000;
const LANDING_MIN_VISITORS = 200;
const CHECKOUT_MIN_SESSIONS = 20;
const MAX_PROPOSALS = 3;

function text(value) { return String(value ?? "").trim(); }
function number(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function pct(value) { return `${(number(value) * 100).toFixed(1)} %`; }
function money(value) { return `${number(value).toFixed(2)} €`; }

const CHANNELS = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

function providerChannel(provider) {
  return CHANNELS[text(provider).toLowerCase()] || "";
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim();
}

function existingSet(records = []) {
  return new Set(records.map((record) => slug(record?.fields?.Expérience || record?.Expérience || record)).filter(Boolean));
}

function uniquePush(output, proposal, existing) {
  if (!proposal || output.length >= MAX_PROPOSALS) return;
  const key = slug(proposal.experience);
  if (!key || existing.has(key) || output.some((item) => slug(item.experience) === key)) return;
  output.push(proposal);
}

function bestEconomicContent(rows = []) {
  return rows
    .filter((row) => providerChannel(row.provider) && number(row.views) >= CONTENT_MIN_VIEWS && number(row.purchases) >= 1 && number(row.net_revenue) > 0)
    .sort((a, b) => number(b.revenue_per_1000_views) - number(a.revenue_per_1000_views)
      || number(b.purchases_per_1000_views) - number(a.purchases_per_1000_views)
      || number(b.net_revenue) - number(a.net_revenue))[0] || null;
}

function viralNoConversion(rows = []) {
  return rows
    .filter((row) => providerChannel(row.provider)
      && number(row.views) >= VIRAL_MIN_VIEWS
      && number(row.purchases) === 0
      && number(row.engagement_rate) >= 0.03)
    .sort((a, b) => number(b.views) - number(a.views) || number(b.engagement_rate) - number(a.engagement_rate))[0] || null;
}

function replicateWinner(row) {
  if (!row) return null;
  const channel = providerChannel(row.provider);
  if (!channel) return null;
  return {
    experience: `Répliquer ${channel} · ${text(row.content_id)} · 3 hooks conversion`,
    channel,
    hypothesis: `Cette création combine déjà portée et efficacité économique (${money(row.revenue_per_1000_views)} de CA net / 1 000 vues ; ${number(row.purchases_per_1000_views).toFixed(2)} achat(s) / 1 000 vues). Conserver le mécanisme, l'angle et la promesse exacte, mais tester trois ouvertures plus fortes devrait élargir la portée sans diluer la conversion. Ne pas copier mot pour mot : varier le hook et les 2 premières secondes.`,
    kpi: `Échantillon ≥ ${CONTENT_MIN_VIEWS} vues par variante. KPI principal : revenu net / 1 000 vues ≥ ${money(row.revenue_per_1000_views)}. KPI secondaire : achats / 1 000 vues ≥ ${number(row.purchases_per_1000_views).toFixed(2)} ; surveiller le taux de remboursement.`,
    result: `Baseline automatique : ${number(row.views).toLocaleString("fr-FR")} vues ; ${row.purchases} achat(s) ; ${money(row.net_revenue)} net ; engagement ${pct(row.engagement_rate)}. Source : Social Performance + Ventes attribuées.`,
  };
}

function repairViral(row) {
  if (!row) return null;
  const channel = providerChannel(row.provider);
  if (!channel) return null;
  return {
    experience: `Réparer ${channel} · ${text(row.content_id)} · viral mais 0 achat`,
    channel,
    hypothesis: `La création a déjà prouvé qu'elle attire l'attention (${number(row.views).toLocaleString("fr-FR")} vues ; engagement ${pct(row.engagement_rate)}) mais elle n'a généré aucun achat attribué. Tester une transition plus nette entre la révélation et le guide, un CTA plus désirable et un lien/profil UTM explicite peut monétiser la portée existante sans rendre le contenu plus long.`,
    kpi: `Ne pas sacrifier plus de 20 % des vues de la baseline. Objectif : ≥ 0,25 achat / 1 000 vues ou ≥ 5 € de CA net / 1 000 vues après au moins ${CONTENT_MIN_VIEWS} vues.`,
    result: `Baseline automatique : ${number(row.views).toLocaleString("fr-FR")} vues ; ${row.engagements || 0} interactions ; 0 achat attribué.`,
  };
}

function repairLanding(funnel = {}) {
  const checkoutSessions = number(funnel.attributed_checkout_sessions);
  if (checkoutSessions < CHECKOUT_MIN_SESSIONS || number(funnel.checkout_to_purchase) >= 0.15) return null;
  return {
    experience: "Landing page · réduire la friction checkout → achat",
    channel: "Landing page",
    hypothesis: `${checkoutSessions} visiteurs attribués ont atteint le checkout mais la conversion checkout → achat n'est que de ${pct(funnel.checkout_to_purchase)}. Tester une version plus courte du bloc d'achat, une preuve de valeur immédiatement avant le CTA et une explication plus claire de l'accès Digify peut lever la friction sans ajouter de pop-up ni dark pattern.`,
    kpi: `Après ≥ ${CHECKOUT_MIN_SESSIONS} nouvelles sessions checkout : checkout → achat > ${pct(Math.max(0.15, number(funnel.checkout_to_purchase) * 1.25))}. Surveiller remboursements et CA net par visiteur.`,
    result: `Baseline automatique : ${funnel.attributed_visitors || 0} visiteurs attribués ; ${checkoutSessions} sessions checkout ; ${funnel.attributed_purchases || 0} achats attribués ; ${money(funnel.net_revenue)} net.`,
  };
}

function repairLandingClick(funnel = {}) {
  const visitors = number(funnel.attributed_visitors);
  if (visitors < LANDING_MIN_VISITORS || number(funnel.visitor_to_checkout) >= 0.08) return null;
  return {
    experience: "Landing page · augmenter visite → checkout",
    channel: "Landing page",
    hypothesis: `Le site reçoit suffisamment de trafic attribué (${visitors} visiteurs) mais seulement ${pct(funnel.visitor_to_checkout)} atteignent le checkout. Tester une promesse d'achat plus visible au-dessus de la ligne de flottaison, un bénéfice concret supplémentaire et un CTA répété après la preuve de valeur devrait augmenter les ouvertures checkout sans modifier le prix.`,
    kpi: `Après ≥ ${LANDING_MIN_VISITORS} nouvelles visites attribuées : visite → checkout ≥ ${pct(Math.max(0.08, number(funnel.visitor_to_checkout) * 1.25))}, sans baisse du checkout → achat.`,
    result: `Baseline automatique : visite → checkout ${pct(funnel.visitor_to_checkout)} ; visite → achat ${pct(funnel.visitor_to_purchase)} ; revenu/visiteur ${money(funnel.revenue_per_attributed_visitor)}.`,
  };
}

export function proposeGrowthExperiments({ contentRows = [], funnel = {}, existing = [] } = {}) {
  const proposals = [];
  const seen = existingSet(existing);

  uniquePush(proposals, replicateWinner(bestEconomicContent(contentRows)), seen);
  uniquePush(proposals, repairViral(viralNoConversion(contentRows)), seen);
  uniquePush(proposals, repairLanding(funnel), seen);
  uniquePush(proposals, repairLandingClick(funnel), seen);

  return proposals.slice(0, MAX_PROPOSALS);
}

export const GROWTH_EXPERIMENT_THRESHOLDS = {
  content_min_views: CONTENT_MIN_VIEWS,
  viral_min_views: VIRAL_MIN_VIEWS,
  landing_min_visitors: LANDING_MIN_VISITORS,
  checkout_min_sessions: CHECKOUT_MIN_SESSIONS,
  max_proposals: MAX_PROPOSALS,
};
