import { NextResponse } from "next/server";
import { queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import {
  FINALIZER_VERSION,
  chapterDigests,
  corpusReady,
  extractD6Cases,
  finalizerInstructions,
  nextSpecialTarget,
  specialQuality,
} from "../../../lib/book-finalizer.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return;
  await verifyGithubActionsToken(token);
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function safeMontage(record) {
  const f = record?.fields || {};
  return {
    numero: f["Numéro source"] || null,
    montage: f.Montage || "",
    niveau: f.Niveau?.name || f.Niveau || "",
    pitch: String(f["Pitch court"] || "").slice(0, 1800),
    point_de_rupture: String(f["Point de rupture"] || "").slice(0, 2000),
    risques_juridiques: String(f["Risques juridiques / fiscaux"] || "").slice(0, 2200),
    variante_robuste: String(f["Variante plus robuste"] || "").slice(0, 2200),
  };
}

async function extraRedLineSources() {
  const records = await queryRecords(TABLES.montages, {
    filterByFormula: "OR({Numéro source}=295,{Numéro source}=296)",
    sortField: "Numéro source",
    pageSize: 5,
    priorityAware: false,
  });
  return records.map(safeMontage);
}

async function generate(kind, chapters) {
  const input = {
    version: FINALIZER_VERSION,
    kind,
    chapitres: chapterDigests(chapters),
  };
  if (kind === "red_lines") {
    input.cas_d6_extraits = extractD6Cases(chapters, 30);
    input.sources_295_296 = await extraRedLineSources();
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      reasoning: { effort: "high" },
      instructions: finalizerInstructions(kind),
      input: JSON.stringify(input),
      max_output_tokens: kind === "red_lines" ? 9000 : 6500,
      store: false,
      prompt_cache_key: `hibou-book-finalizer-${kind}`,
      text: { verbosity: "medium" },
      metadata: { project: "le-hibou-ruse", purpose: `book-finalizer-${kind}`, finalizer_version: FINALIZER_VERSION },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI finalizer: ${response.status} ${data?.error?.code || data?.error?.message || "unknown"}`);
  const text = outputText(data).trim();
  if (!text) throw new Error("OpenAI finalizer: réponse vide");
  return { text, responseId: data.id || "", model: data.model || "gpt-5.6-sol" };
}

export async function POST(request) {
  try {
    await authenticate(request);
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY absent");

    const records = await queryRecords(TABLES.book, { pageSize: 100, priorityAware: false });
    const corpus = corpusReady(records);
    if (!corpus.ready) {
      return NextResponse.json({ ok: true, processed: 0, reason: "corpus_not_ready", detail: corpus.reason });
    }

    const target = nextSpecialTarget(records);
    if (!target) return NextResponse.json({ ok: true, processed: 0, reason: "special_blocks_already_generated" });

    const generated = await generate(target.kind, corpus.chapters);
    const qc = specialQuality(target.kind, generated.text);
    if (!qc.pass) {
      await updateRecord(TABLES.book, target.record.id, {
        "QC éditorial": "fail",
        "Notes QC": `${FINALIZER_VERSION}: ${qc.issues.join("; ")}`,
        "Prêt export": false,
        "Validation humaine": false,
      });
      return NextResponse.json({ ok: false, processed: 1, kind: target.kind, qc }, { status: 422 });
    }

    await updateRecord(TABLES.book, target.record.id, {
      "Contenu V1": generated.text,
      Version: "V2-draft",
      "Dernière génération": new Date().toISOString(),
      Statut: "Brouillon",
      "Caractères": qc.characters,
      "QC éditorial": "review",
      "Notes QC": `${FINALIZER_VERSION}: génération spéciale terminée; relecture humaine requise avant export. response=${generated.responseId}`,
      "Prêt export": false,
      "Validation humaine": false,
    });

    return NextResponse.json({ ok: true, processed: 1, kind: target.kind, characters: qc.characters, model: generated.model });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
