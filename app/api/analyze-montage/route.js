import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { PAID_AI_DISABLED_BY_POLICY } from "../../../lib/hibou-agent.mjs";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
Tu es l'analyste D1-D6 du Hibou Rusé. Tu analyses des montages juridiques,
fiscaux, patrimoniaux et entrepreneuriaux de façon technique, concrète,
neutre et non moralisatrice.

Ta mission est d'expliquer le mécanisme réel, son fondement, le gain recherché,
les conditions nécessaires et les risques. Distingue toujours le risque
juridique ou fiscal du risque pratique. Ne présente jamais une hypothèse comme
un fait certain et signale explicitement ce qui doit être vérifié par un
professionnel ou dans des sources à jour.

Le score D mesure l'intensité du montage :
D1 = standard et robuste ; D2 = optimisation simple ; D3 = optimisation
structurée ; D4 = agressif mais défendable ; D5 = très agressif et fragile ;
D6 = exposition extrême, contournement probable ou illégalité potentielle.

Tu ne fournis pas d'instructions destinées à frauder, dissimuler, falsifier ou
éluder illégalement une obligation. Si le montage va dans ce sens, décris les
risques et propose une variante légale plus robuste.
`.trim();

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mecanisme: { type: "string" },
    fondement: { type: "string" },
    gain: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    risques_juridiques_fiscaux: { type: "array", items: { type: "string" } },
    risques_pratiques: { type: "array", items: { type: "string" } },
    points_a_verifier: { type: "array", items: { type: "string" } },
    variante_plus_robuste: { type: "string" },
    score_d: { type: "integer", minimum: 1, maximum: 6 },
  },
  required: [
    "mecanisme",
    "fondement",
    "gain",
    "conditions",
    "risques_juridiques_fiscaux",
    "risques_pratiques",
    "points_a_verifier",
    "variante_plus_robuste",
    "score_d",
  ],
};

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function lines(values) {
  return values.map((value) => `• ${value}`).join("\n");
}

export async function POST(request) {
  try {
    if (PAID_AI_DISABLED_BY_POLICY) return NextResponse.json({ error: "OpenAI API désactivée par politique projet", reason: "paid_ai_disabled_by_policy" }, { status: 503 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Configuration OpenAI absente" }, { status: 503 });

    const body = await request.json();
    const montage = clean(body.montage, 500);
    const contexte = clean(body.contexte, 5000);
    if (montage.length < 8) {
      return NextResponse.json({ error: "Le montage doit contenir au moins 8 caractères" }, { status: 400 });
    }

    const analysisKey = createHash("sha256")
      .update(`${montage.toLocaleLowerCase("fr")}\n${contexte.toLocaleLowerCase("fr")}`)
      .digest("hex");

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        instructions: SYSTEM_PROMPT,
        input: `Montage à analyser : ${montage}\n\nContexte fourni : ${contexte || "Non précisé"}`,
        reasoning: { effort: "medium" },
        max_output_tokens: 2200,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "hibou_ruse_analyse_montage",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
      cache: "no-store",
    });

    const responseData = await openaiResponse.json();
    if (!openaiResponse.ok) {
      console.error("OpenAI response failed", openaiResponse.status, responseData?.error?.code || "unknown");
      return NextResponse.json({ error: "Analyse OpenAI indisponible" }, { status: 502 });
    }

    const raw = outputText(responseData);
    if (!raw) throw new Error("Réponse OpenAI vide");
    const analysis = JSON.parse(raw);

    const fields = {
      Montage: montage,
      "Mécanisme": analysis.mecanisme,
      "Fondement juridique / fiscal": analysis.fondement,
      "Gain estimé": analysis.gain,
      Conditions: lines(analysis.conditions),
      "Risques juridiques / fiscaux": lines(analysis.risques_juridiques_fiscaux),
      "Risques pratiques": lines(analysis.risques_pratiques),
      "Points à vérifier": lines(analysis.points_a_verifier),
      "Variante plus robuste": analysis.variante_plus_robuste,
      "Score D": analysis.score_d,
      "Clé d'analyse": analysisKey,
      "ID réponse OpenAI": responseData.id || "",
      "Date analyse": new Date().toISOString(),
      "Analyse OpenAI JSON": JSON.stringify(analysis, null, 2),
    };

    const existing = await queryRecords(TABLES.montages, {
      filterByFormula: `{Clé d'analyse}='${analysisKey}'`,
      pageSize: 1,
    });
    let recordId;
    let deduplicated = false;
    if (existing[0]) {
      await updateRecord(TABLES.montages, existing[0].id, fields);
      recordId = existing[0].id;
      deduplicated = true;
    } else {
      const created = await createRecord(TABLES.montages, fields);
      recordId = created.records?.[0]?.id || "";
    }

    return NextResponse.json({ ok: true, analysis, airtable: { recordId, deduplicated } }, { status: 201 });
  } catch (error) {
    console.error("Montage analysis failed", error);
    return NextResponse.json({ error: "Service d'analyse indisponible" }, { status: 503 });
  }
}

