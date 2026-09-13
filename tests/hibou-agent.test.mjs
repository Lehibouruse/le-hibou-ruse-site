import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentRequest,
  estimateCost,
  getAgentConfig,
  HIBOU_AGENT_PROMPT_VERSION,
  minimalJobContext,
  routeJob,
  runAgentJob,
} from "../lib/hibou-agent.mjs";

function job(action, parameters = {}) {
  return {
    id: "rec_test",
    fields: {
      job_id: "job-test",
      action,
      target: "cible",
      parameters: JSON.stringify(parameters),
    },
  };
}

test("les règles déterministes n'appellent pas l'IA", () => {
  assert.equal(routeJob(job("HEALTH_CHECK")).kind, "deterministic");
  assert.equal(routeJob(job("UPDATE_SITE", { key: "hero" })).kind, "deterministic");
});

test("Luna est le choix par défaut pour une tâche simple", () => {
  assert.deepEqual(
    { kind: routeJob(job("CREATE_VARIATION")).kind, tier: routeJob(job("CREATE_VARIATION")).tier },
    { kind: "ai", tier: "luna" },
  );
});

test("Terra est utilisé pour l'intermédiaire", () => {
  assert.equal(routeJob(job("PROCESS_LEAD")).tier, "terra");
  assert.equal(routeJob(job("REPURPOSE", { complexity: "intermediate" })).tier, "terra");
});

test("Sol et Astra peuvent être sélectionnés directement selon la difficulté", () => {
  assert.equal(routeJob(job("REPURPOSE", { complexity: "complex" })).tier, "sol");
  assert.equal(routeJob(job("REPURPOSE", { complexity: "critical" })).tier, "astra");
  assert.equal(routeJob(job("REPURPOSE", { requested_model: "gpt-6-astra" })).reasoning, "xhigh");
});

test("un tier désactivé redescend vers le meilleur tier autorisé", () => {
  const config = getAgentConfig({ HIBOU_ALLOW_ASTRA: "false", HIBOU_ALLOW_SOL: "true" });
  assert.equal(routeJob(job("REPURPOSE", { complexity: "critical" }), config).tier, "sol");
});

test("CREATE_VIDEO est agentique et sélectionne directement Sol", () => {
  const route = routeJob(job("CREATE_VIDEO"));
  assert.equal(route.kind, "ai");
  assert.equal(route.tier, "sol");
});

test("UPDATE_SITE global n'exige plus parameters.key", () => {
  const global = routeJob(job("UPDATE_SITE", { objective: "Finaliser le site" }));
  const deterministic = routeJob(job("UPDATE_SITE", { key: "hero", fields: { Titre: "Titre" } }));
  assert.equal(global.kind, "ai");
  assert.equal(global.tier, "sol");
  assert.equal(deterministic.kind, "deterministic");
});

test("le contexte minimal supprime les secrets", () => {
  const source = job("CREATE_VARIATION", {
    objective: "Créer une variante",
    api_key: "ne-doit-pas-sortir",
    nested: { password: "non", value: "oui" },
  });
  const context = minimalJobContext(source, routeJob(source));
  assert.equal(context.includes("ne-doit-pas-sortir"), false);
  assert.equal(context.includes('"value":"oui"'), true);
});

test("le coût sépare entrée normale et entrée cachée", () => {
  const cost = estimateCost("gpt-5.6-luna", {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 400 },
    output_tokens: 200,
  });
  assert.equal(cost, ((600 * 0.2) + (400 * 0.02) + (200 * 1.2)) / 1_000_000);
});

test("le coût Astra utilise son tarif officiel", () => {
  assert.equal(
    estimateCost("gpt-6-astra", { input_tokens: 1000, input_tokens_details: { cached_tokens: 200 }, output_tokens: 100 }),
    ((800 * 10) + (200 * 1) + (100 * 50)) / 1_000_000,
  );
});

test("le kill switch et les plafonds sont bornés", () => {
  const config = getAgentConfig({
    AI_ENABLED: "true",
    HIBOU_AI_KILL_SWITCH: "true",
    HIBOU_MAX_ESCALATIONS: "99",
    HIBOU_MAX_API_RETRIES: "99",
  });
  assert.equal(config.aiEnabled, false);
  assert.equal(config.maxEscalations, 2);
  assert.equal(config.maxApiRetries, 1);
});

test("la requête Responses API réutilise HIBOU_AGENT_V1 et impose le JSON", () => {
  const source = job("CREATE_VARIATION", { objective: "Une accroche courte" });
  const route = routeJob(source);
  const config = getAgentConfig({});
  const request = buildAgentRequest({ source, job: source, route, model: config.models.luna, reasoning: "low", config });
  assert.equal(request.metadata.agent, HIBOU_AGENT_PROMPT_VERSION);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.prompt_cache_key, "hibou-agent-v1");
  assert.equal(request.store, false);
});

test("l'escalade réelle passe de Luna à Terra une seule fois", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    const status = calls.length === 1 ? "needs_escalation" : "completed";
    return {
      ok: true,
      json: async () => ({
        id: `resp_${calls.length}`,
        output_text: JSON.stringify({
          status,
          result: status === "completed" ? "résultat final" : "analyse insuffisante",
          escalation_reason: status === "completed" ? "" : "ambiguïté réelle",
          confidence: status === "completed" ? 0.9 : 0.4,
        }),
        usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 30 },
      }),
    };
  };
  try {
    const source = job("CREATE_VARIATION", { objective: "Créer une variante" });
    const result = await runAgentJob({
      job: source,
      route: routeJob(source),
      env: { OPENAI_API_KEY: "test-only", HIBOU_MAX_API_RETRIES: "0" },
    });
    assert.deepEqual(calls, ["gpt-5.6-luna", "gpt-5.6-terra"]);
    assert.equal(result.status, "completed");
    assert.equal(result.escalations, 1);
    assert.equal(result.ai_calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("le plafond journalier arrête le Job avant tout appel", async () => {
  const source = job("CREATE_VARIATION", { objective: "Créer une variante" });
  const result = await runAgentJob({
    job: source,
    route: routeJob(source),
    dailySpendUsd: 1,
    env: { OPENAI_API_KEY: "test-only", HIBOU_DAILY_HARD_BUDGET_USD: "1" },
  });
  assert.equal(result.status, "waiting_for_human");
  assert.equal(result.ai_calls, 0);
});

test("une escalade Sol peut atteindre Astra sans passer par les tiers inférieurs", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    const status = calls.length === 1 ? "needs_escalation" : "completed";
    return {
      ok: true,
      json: async () => ({
        id: `resp_${calls.length}`,
        output_text: JSON.stringify({ status, result: "résultat", escalation_reason: status === "completed" ? "" : "enjeu exceptionnel", confidence: 0.8 }),
        usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20 },
      }),
    };
  };
  try {
    const source = job("REPURPOSE", { complexity: "complex" });
    const result = await runAgentJob({ job: source, route: routeJob(source), env: { OPENAI_API_KEY: "test-only", HIBOU_MAX_API_RETRIES: "0" } });
    assert.deepEqual(calls, ["gpt-5.6-sol", "gpt-6-astra"]);
    assert.equal(result.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
