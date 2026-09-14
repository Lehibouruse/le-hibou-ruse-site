import { NextResponse } from "next/server";
import { createRecord, TABLES } from "../../../lib/airtable";

const clean = (value, max) => String(value || "").trim().slice(0, max);

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.company) return NextResponse.json({ ok: true });
    const contact = clean(body.contact, 120);
    const email = clean(body.email, 160);
    const context = clean(body.context, 3500);
    const need = clean(body.need, 2500);
    if (!email.includes("@") || !context || !need) return NextResponse.json({ error: "Données invalides" }, { status: 400 });
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
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Lead submission failed", error);
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }
}
