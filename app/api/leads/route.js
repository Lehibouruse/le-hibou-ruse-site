import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES } from "../../../lib/airtable";
import { escapeFormula } from "../../../lib/commerce.mjs";
import { attributionProvenance, normalizeAttribution } from "../../../lib/attribution.mjs";
import { vercelDeploymentOrigin } from "../../../lib/vercel-deployment-origin.mjs";

const MAX_BODY_BYTES = 10_000;
const ALLOWED_ORIGINS = new Set(["https://d4d5d6.com", "https://www.d4d5d6.com", "https://le-hibou-ruse-site.vercel.app"]);
if (vercelDeploymentOrigin()) ALLOWED_ORIGINS.add(vercelDeploymentOrigin());
const clean = (value, max) => String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
function allowedOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return false;
  try { return ALLOWED_ORIGINS.has(new URL(origin).origin); } catch { return false; }
}
function json(body, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }

export async function POST(request) {
  try {
    if (!allowedOrigin(request)) return json({ error: "Origin refused" }, 403);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return json({ error: "Format invalide" }, 415);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json({ error: "Requête trop volumineuse" }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "Requête trop volumineuse" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "JSON invalide" }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Données invalides' }, 400);
    if (body.company) return json({ ok: true });
    const signup = body.kind === 'book_launch';
    if (signup && body.consent !== true) return json({ error: 'Demande explicite requise' }, 400);
    const contact = clean(body.contact, 120);
    const email = clean(body.email, 160).toLowerCase();
    const context = signup ? 'Ouverture du livre Le Hibou Rusé' : clean(body.context, 3500);
    const need = signup ? 'Recevoir uniquement un e-mail lors de l’ouverture de la vente du livre.' : clean(body.need, 2500);
    const attribution = normalizeAttribution(body.attribution || {});
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail || !context || !need) return json({ error: "Données invalides" }, 400);
    const today = new Date().toISOString().slice(0, 10);
    const conditions = `{Email}='${escapeFormula(email)}',{Contexte}='${escapeFormula(context)}',{Besoin}='${escapeFormula(need)}'`;
    const duplicates = await queryRecords(TABLES.leads, { filterByFormula: `AND(${conditions}${signup ? '' : `,LEFT({Date},10)='${today}'`})`, pageSize: 1 });
    if (duplicates.length) return json({ ok: true, deduplicated: true });
    await createRecord(TABLES.leads, {
      Contact: contact || (signup ? 'Lecteur inscrit à l’ouverture' : 'Anonyme'), Email: email, Contexte: context, Besoin: need, Objectif: need, Statut: 'Nouveau',
      Notes: [
        signup ? 'BOOK_LAUNCH_WAITLIST; consent=true; consent_version=2026-10-03; finalité=un seul e-mail à l’ouverture; aucun abonnement marketing; ne pas traiter comme une demande de prestation.' : 'Créé automatiquement depuis le formulaire Services proposés du site.',
        `session_id=${attribution.session_id || ''}`, `utm_medium=${attribution.utm_medium || ''}`, `utm_campaign=${attribution.utm_campaign || ''}`, `utm_content=${attribution.utm_content || ''}`, `landing_page=${attribution.landing_page || ''}`,
      ].join('; '),
      Source: `Site — ${signup ? 'Ouverture du livre' : 'Services proposés'} — ${attributionProvenance(attribution)}`, Date: new Date().toISOString(),
    });
    return json({ ok: true }, 201);
  } catch (error) {
    console.error('Lead submission failed', String(error?.message || error).slice(0, 300));
    return json({ error: 'Service indisponible' }, 503);
  }
}
