import { NextResponse } from "next/server";
import { createRecord, TABLES } from "../../../lib/airtable";

const MAX_BODY_BYTES = 10_000;
const ALLOWED_ORIGINS = new Set([
  "https://d4d5d6.com",
  "https://www.d4d5d6.com",
  "https://le-hibou-ruse-site.vercel.app",
]);

const clean = (value, max) => String(value || "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .trim()
  .slice(0, max);

function allowedOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return false;
  try { return ALLOWED_ORIGINS.has(new URL(origin).origin); }
  catch { return false; }
}

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

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

    if (body.company) return json({ ok: true });
    const contact = clean(body.contact, 120);
    const email = clean(body.email, 160).toLowerCase();
    const context = clean(body.context, 3500);
    const need = clean(body.need, 2500);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail || !context || !need) return json({ error: "Données invalides" }, 400);

    await createRecord(TABLES.leads, {
      Contact: contact || "Anonyme",
      Email: email,
      Contexte: context,
      Besoin: need,
      Objectif: need,
      Statut: "Nouveau",
      Notes: "Créé automatiquement depuis le formulaire Services proposés du site.",
      Source: "Site — Services proposés",
      Date: new Date().toISOString(),
    });
    return json({ ok: true }, 201);
  } catch (error) {
    console.error("Lead submission failed", String(error?.message || error).slice(0, 300));
    return json({ error: "Service indisponible" }, 503);
  }
}
