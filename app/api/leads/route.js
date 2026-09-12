import { NextResponse } from "next/server";
import { createRecord, TABLES } from "../../../lib/airtable";

const clean = (value, max) => String(value || "").trim().slice(0, max);

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.company) return NextResponse.json({ ok: true });
    const contact = clean(body.contact, 120);
    const email = clean(body.email, 160);
    const context = clean(body.context, 2500);
    const need = clean(body.need, 1500);
    const goal = clean(body.goal, 1500);
    if (!contact || !email.includes("@") || !context || !need || !goal) return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    await createRecord(TABLES.leads, {
      Contact: contact, Email: email, Contexte: context, Besoin: need, Objectif: goal,
      Statut: "Nouveau", Notes: "Créé automatiquement depuis le formulaire du site.",
      Source: "Site — Montage personnalisé", Date: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Lead submission failed", error);
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }
}
