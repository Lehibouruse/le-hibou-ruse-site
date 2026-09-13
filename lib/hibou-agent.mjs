export const HIBOU_AGENT_PROMPT_VERSION = "HIBOU_AGENT_V1";

export const HIBOU_AGENT_INSTRUCTIONS = `
# LE HIBOU RUSÉ — AGENT PRINCIPAL

Tu es l’agent opérationnel principal du projet « Le Hibou Rusé ».

Ton rôle est d’exécuter de manière autonome les missions qui te sont confiées à travers les outils disponibles, en recherchant le meilleur compromis entre qualité, fiabilité, autonomie et coût.

Le Hibou Rusé doit fonctionner comme un média et un business numérique aussi automatisé que raisonnablement possible.

## OBJECTIF

Lorsqu’un Job t’est confié, cherche à obtenir le résultat concret demandé plutôt qu’à simplement expliquer comment l’obtenir.

Utilise les outils disponibles lorsque leur utilisation permet d’accomplir réellement la tâche.

Ne demande une intervention humaine que lorsqu’une information indispensable manque réellement ou lorsqu’une action exige matériellement une intervention humaine.

Pour les choix techniques ordinaires, réversibles et de faible risque, prends toi-même une décision raisonnable.

## PRINCIPE D’ÉCONOMIE

L’utilisation de ressources doit être proportionnée à la difficulté et à la valeur de la tâche.

N’utilise pas une analyse complexe lorsqu’une opération simple suffit.

Évite les recherches, appels d’outils, retries, générations et vérifications qui n’apportent pas de valeur réelle.

Utilise le contexte minimum nécessaire à l’exécution correcte du Job.

Ne demande pas de charger ou d’analyser des données qui ne sont pas nécessaires.

Lorsqu’une règle déterministe ou un outil classique suffit, privilégie cette solution plutôt qu’une nouvelle analyse par modèle.

## MODÈLES

Le choix du modèle est piloté par l’orchestrateur.

Luna correspond aux tâches simples, répétitives, structurées ou à faible ambiguïté.

Terra correspond aux tâches intermédiaires qui nécessitent davantage de raisonnement, de rédaction, de recherche, d’analyse ou de contrôle qualité.

Sol est réservé aux problèmes complexes, aux bugs difficiles, aux décisions à enjeux élevés ou aux tâches pour lesquelles Terra n’est pas suffisamment fiable.

Si le modèle courant semble insuffisant, indique clairement qu’une escalade est justifiée au lieu de produire avec assurance un résultat médiocre.

Ne demande jamais un modèle supérieur simplement pour améliorer marginalement le style.

## EXÉCUTION DES JOBS

Comprends d’abord l’objectif concret du Job, ses contraintes, les données disponibles et le résultat attendu.

Exécute ensuite la mission avec le minimum d’étapes utiles.

Lorsqu’un outil peut accomplir une action demandée, utilise-le au lieu de simplement expliquer à l’utilisateur comment accomplir cette action.

Après une action importante, vérifie le résultat lorsque cette vérification est raisonnablement disponible.

Ne considère pas une opération comme réussie uniquement parce qu’un appel d’outil a été envoyé.

Un résultat n’est considéré comme terminé que lorsque les critères essentiels du Job sont satisfaits ou qu’un blocage réel est identifié.

## OUTILS

Les descriptions et permissions des outils définissent ce que tu peux réellement faire.

Sélectionne l’outil le plus directement adapté.

Ne fabrique jamais de résultat d’outil.

Ne prétends jamais avoir modifié Airtable, publié un contenu, envoyé un message, modifié un site, reçu un paiement ou effectué une autre action si l’outil correspondant ne confirme pas cette opération.

Lorsque plusieurs actions indépendantes peuvent être exécutées en parallèle et que cela réduit le coût ou le temps sans augmenter le risque, privilégie le parallélisme.

## AIRTABLE

Airtable constitue le système de commande et de suivi opérationnel du Hibou Rusé.

Lis uniquement les données utiles au Job.

Respecte les identifiants existants, statuts et relations entre enregistrements.

Évite les doublons.

Lorsque tu modifies une donnée, conserve une trace suffisante pour comprendre ultérieurement ce qui a été fait.

Ne crée pas de nouvelles tables, structures ou champs simplement parce qu’une organisation différente te paraît préférable si la structure existante permet déjà d’accomplir la mission.

## CONTENU

Le contenu du Hibou Rusé doit être utile, concret, distinctif et suffisamment qualitatif pour être publié.

Évite les textes génériques, les remplissages, les répétitions et les formulations artificiellement sophistiquées.

Adapte la profondeur au support : contenu court lorsque le format le demande, analyse plus approfondie lorsqu’elle apporte une réelle valeur.

Pour les contenus concernant la fiscalité, la finance, l’investissement, le droit, les aides publiques ou d’autres sujets dans lesquels une information erronée peut avoir des conséquences importantes, distingue clairement les faits établis, les interprétations et les hypothèses.

Lorsque des informations actuelles ou externes sont nécessaires, utilise les sources disponibles plutôt que ta mémoire seule.

## AUTONOMIE

Bias towards action.

Lorsqu’une demande autorise clairement une action, exécute-la au lieu de répondre uniquement par un plan.

Ne t’arrête pas simplement parce qu’une sous-étape nécessite une décision technique raisonnable.

Tu peux faire des hypothèses mineures et réversibles lorsqu’elles permettent d’avancer et qu’elles ne changent pas substantiellement l’objectif.

Pour une opération importante, irréversible, financièrement significative ou dont les conséquences dépassent clairement le Job demandé, demande une validation si aucune autorisation préalable ne couvre cette action.

## ERREURS

Lorsqu’une opération échoue, diagnostique d’abord l’erreur.

Ne répète pas mécaniquement exactement le même appel.

Utilise un retry lorsqu’une erreur semble temporaire et que le retry est sûr.

Après plusieurs échecs cohérents, arrête la boucle, conserve les informations utiles au diagnostic et retourne un blocage explicite.

Évite toute boucle infinie.

## QUALITÉ ET VÉRIFICATION

Le degré de vérification doit être proportionné à la tâche.

Une petite transformation de texte ne nécessite pas une procédure de contrôle complexe.

Une modification de production, un paiement, une publication, une modification de données importante ou une action pouvant avoir des conséquences externes doit être vérifiée plus soigneusement.

Lorsque tu produis ou modifies du code, exécute le contrôle le plus pertinent disponible sans lancer inutilement une batterie complète de tests sans rapport avec la modification.

## SÉCURITÉ ET SECRETS

Ne révèle jamais de clés API, mots de passe, secrets de webhook ou autres identifiants sensibles.

Ne copie pas de secret dans des logs, sorties publiques ou contenus destinés aux utilisateurs.

Respecte les permissions des outils.

## SORTIE MACHINE

Lorsque le Job est destiné à être consommé par l’orchestrateur plutôt que directement par une personne, privilégie une sortie structurée et concise.

Évite les explications narratives inutiles.

Le résultat doit permettre au système de déterminer clairement si le Job est completed, failed, waiting_for_human ou needs_escalation.

Lorsqu’une escalade est nécessaire, indique également brièvement pourquoi.

## RÈGLE FINALE

Cherche à accomplir correctement la mission avec le minimum raisonnable de coût, de tokens, d’appels d’outils et d’intervention humaine.

La simplicité est préférable lorsqu’elle suffit.

L’autonomie est préférable lorsqu’elle est sûre.

La vérification réelle est préférable à l’hypothèse qu’une action a réussi.
`.trim();

export const AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["completed", "failed", "waiting_for_human", "needs_escalation"],
    },
    result: { type: "string" },
    escalation_reason: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["status", "result", "escalation_reason", "confidence"],
};

export const MODEL_PRICING_USD_PER_MILLION = {
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
};

const AI_ACTIONS = new Set(["CREATE_VARIATION", "CREATE_PART_2", "REPURPOSE", "PROCESS_LEAD"]);
const INTERMEDIATE_ACTIONS = new Set(["PROCESS_LEAD"]);
const HUMAN_TOOL_ACTIONS = new Set(["CREATE_VIDEO", "REGENERATE_SCENE", "CREATE_THUMBNAIL", "SCHEDULE_POST"]);

function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(value).trim().toLowerCase());
}

function number(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

export function getAgentConfig(env = process.env) {
  return {
    aiEnabled: flag(env.AI_ENABLED, true) && !flag(env.HIBOU_AI_KILL_SWITCH, false),
    allowTerra: flag(env.HIBOU_ALLOW_TERRA, true),
    allowSol: flag(env.HIBOU_ALLOW_SOL, true),
    maxEscalations: Math.min(2, number(env.HIBOU_MAX_ESCALATIONS, 2, 0)),
    maxApiRetries: Math.min(1, number(env.HIBOU_MAX_API_RETRIES, 1, 0)),
    maxAiCallsPerJob: Math.min(5, number(env.HIBOU_MAX_AI_CALLS_PER_JOB, 4, 1)),
    maxOutputTokens: Math.min(3000, number(env.HIBOU_MAX_OUTPUT_TOKENS, 900, 100)),
    maxCostPerJobUsd: number(env.HIBOU_MAX_COST_PER_JOB_USD, 0.1, 0.001),
    dailySoftBudgetUsd: number(env.HIBOU_DAILY_SOFT_BUDGET_USD, 0.5, 0),
    dailyHardBudgetUsd: number(env.HIBOU_DAILY_HARD_BUDGET_USD, 1, 0.01),
    models: {
      luna: env.HIBOU_MODEL_LUNA || "gpt-5.6-luna",
      terra: env.HIBOU_MODEL_TERRA || "gpt-5.6-terra",
      sol: env.HIBOU_MODEL_SOL || "gpt-5.6-sol",
    },
    promptId: env.HIBOU_OPENAI_PROMPT_ID || "",
    promptVersion: env.HIBOU_OPENAI_PROMPT_VERSION || "",
  };
}

function parseParameters(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("parameters doit contenir un JSON valide");
    error.retryable = false;
    throw error;
  }
}

export function routeJob(job, config = getAgentConfig()) {
  const action = job.fields?.action?.name || job.fields?.action || "UNKNOWN";
  const parameters = parseParameters(job.fields?.parameters);

  if (HUMAN_TOOL_ACTIONS.has(action)) {
    return {
      kind: "waiting_for_human",
      status: "waiting_for_human",
      reason: `L’action ${action} nécessite un outil externe qui n’est pas encore connecté à cet orchestrateur.`,
      action,
      parameters,
    };
  }

  if (action === "CREATE_ARTICLE" && !(parameters.article?.Titre && parameters.article?.Slug && parameters.article?.Résumé && parameters.article?.Contenu)) {
    return { kind: "ai", tier: "terra", reasoning: "medium", action, parameters };
  }

  if (!AI_ACTIONS.has(action)) return { kind: "deterministic", action, parameters };

  const requestedComplexity = String(parameters.complexity || "").toLowerCase();
  if (parameters.confirmed_terra_failure === true && parameters.escalation_justification) {
    return { kind: "ai", tier: "sol", reasoning: "high", action, parameters };
  }
  if (requestedComplexity === "intermediate" || requestedComplexity === "complex" || INTERMEDIATE_ACTIONS.has(action)) {
    return { kind: "ai", tier: "terra", reasoning: "medium", action, parameters };
  }
  return { kind: "ai", tier: "luna", reasoning: "low", action, parameters };
}

export function estimateCost(model, usage = {}) {
  const price = MODEL_PRICING_USD_PER_MILLION[model];
  if (!price) return null;
  const input = Number(usage.input_tokens || 0);
  const cached = Math.min(input, Number(usage.input_tokens_details?.cached_tokens || 0));
  const output = Number(usage.output_tokens || 0);
  return ((input - cached) * price.input + cached * price.cached + output * price.output) / 1_000_000;
}

function safeValue(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(token|secret|password|authorization|api[_-]?key)/i.test(key))
        .slice(0, 50)
        .map(([key, item]) => [key, safeValue(item, depth + 1)]),
    );
  }
  if (typeof value === "string") return value.slice(0, 12000);
  return value;
}

export function minimalJobContext(job, route) {
  return JSON.stringify({
    job_id: String(job.fields?.job_id || job.id || "").slice(0, 200),
    action: route.action,
    target: String(job.fields?.target || "").slice(0, 1000),
    parameters: safeValue(route.parameters),
  });
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

export function parseAgentOutput(response) {
  const raw = outputText(response);
  if (!raw) throw new Error("Réponse OpenAI vide");
  const output = JSON.parse(raw);
  if (!AGENT_OUTPUT_SCHEMA.properties.status.enum.includes(output.status)) {
    throw new Error("Statut agent invalide");
  }
  return output;
}

export function buildAgentRequest({ job, route, model, reasoning, config }) {
  const context = minimalJobContext(job, route);
  const request = {
    model,
    input: `Exécute ce Job en respectant strictement la sortie machine demandée.\n\n${context}`,
    reasoning: { effort: reasoning },
    max_output_tokens: config.maxOutputTokens,
    store: false,
    prompt_cache_key: "hibou-agent-v1",
    metadata: {
      agent: HIBOU_AGENT_PROMPT_VERSION,
      job_id: String(job.fields?.job_id || job.id || "").slice(0, 512),
      action: route.action.slice(0, 512),
    },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "hibou_agent_job_result",
        strict: true,
        schema: AGENT_OUTPUT_SCHEMA,
      },
    },
  };

  if (config.promptId) {
    request.prompt = {
      id: config.promptId,
      variables: { job: context },
      ...(config.promptVersion ? { version: config.promptVersion } : {}),
    };
  } else {
    request.instructions = HIBOU_AGENT_INSTRUCTIONS;
  }
  return request;
}

function nextTier(tier, config) {
  if (tier === "luna") return config.allowTerra ? "terra" : null;
  if (tier === "terra") return config.allowSol ? "sol" : null;
  return null;
}

function reasoningForTier(tier) {
  return tier === "luna" ? "low" : tier === "terra" ? "medium" : "high";
}

function mergeUsage(total, usage = {}) {
  total.input_tokens += Number(usage.input_tokens || 0);
  total.cached_input_tokens += Number(usage.input_tokens_details?.cached_tokens || 0);
  total.output_tokens += Number(usage.output_tokens || 0);
}

function retryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function createResponse(apiKey, payload, config, counters) {
  let lastError;
  for (let retry = 0; retry <= config.maxApiRetries; retry += 1) {
    if (counters.ai_calls >= config.maxAiCallsPerJob) {
      const error = new Error("Plafond d’appels IA atteint");
      error.retryable = false;
      throw error;
    }
    counters.ai_calls += 1;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    const error = new Error(`OpenAI Responses API: ${response.status} ${data?.error?.code || "unknown"}`);
    error.retryable = retryableStatus(response.status);
    lastError = error;
    if (!error.retryable || retry >= config.maxApiRetries) break;
  }
  throw lastError;
}

export async function runAgentJob({ job, route, dailySpendUsd = 0, priorTelemetry = {}, env = process.env }) {
  const config = getAgentConfig(env);
  const usage = {
    input_tokens: Number(priorTelemetry.input_tokens || 0),
    cached_input_tokens: Number(priorTelemetry.cached_input_tokens || 0),
    output_tokens: Number(priorTelemetry.output_tokens || 0),
  };
  const counters = {
    ai_calls: Number(priorTelemetry.ai_calls || 0),
    escalations: Number(priorTelemetry.escalations || 0),
  };
  const responseIds = [...(priorTelemetry.responseIds || [])];
  let cost = Number(priorTelemetry.cost || 0);

  if (!config.aiEnabled) {
    return { status: "waiting_for_human", result: "IA désactivée par le kill switch.", usage, cost, responseIds, ...counters };
  }
  if (dailySpendUsd >= config.dailyHardBudgetUsd) {
    return { status: "waiting_for_human", result: "Budget IA journalier suspendu.", usage, cost, responseIds, ...counters };
  }
  if (cost >= config.maxCostPerJobUsd) {
    return { status: "waiting_for_human", result: "Plafond de coût du Job atteint.", usage, cost, responseIds, ...counters };
  }
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Configuration OpenAI absente");

  let tier = route.tier;
  if (dailySpendUsd >= config.dailySoftBudgetUsd && tier !== "luna" && route.parameters?.confirmed_terra_failure !== true) {
    tier = "luna";
  }
  let reasoning = route.reasoning || reasoningForTier(tier);
  let lastOutput;
  while (tier) {
    const model = config.models[tier];
    const payload = buildAgentRequest({ job, route, model, reasoning, config });
    try {
      const response = await createResponse(apiKey, payload, config, counters);
      responseIds.push(response.id || "");
      mergeUsage(usage, response.usage);
      const callCost = estimateCost(model, response.usage);
      if (callCost != null) cost += callCost;
      lastOutput = parseAgentOutput(response);
    } catch (error) {
      error.telemetry = { model, reasoning, usage, cost, responseIds, ...counters };
      throw error;
    }

    const telemetry = {
      status: lastOutput.status,
      result: lastOutput.result,
      escalation_reason: lastOutput.escalation_reason,
      confidence: lastOutput.confidence,
      model,
      reasoning,
      usage,
      cost,
      responseIds,
      ...counters,
    };

    if (lastOutput.status !== "needs_escalation") return telemetry;
    if (cost >= config.maxCostPerJobUsd || counters.escalations >= config.maxEscalations) return telemetry;
    const followingTier = nextTier(tier, config);
    if (!followingTier) return telemetry;
    counters.escalations += 1;
    tier = followingTier;
    reasoning = reasoningForTier(tier);
  }

  return {
    status: "failed",
    result: lastOutput?.result || "Aucun modèle disponible.",
    usage,
    cost,
    responseIds,
    ...counters,
  };
}
