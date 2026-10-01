import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { configMap, TABLES } from "../lib/airtable.js";
import { DIGITAL_SUPPLY_CONSENT_VERSION } from "../lib/digital-supply-consent.mjs";

// Execute the real route, replacing only its HTTP response adapter and remote
// providers. No checkout or Airtable request leaves the test process.
const routeUrl = new URL("../app/api/commerce/digital-supply-consent/route.js", import.meta.url).href;
const mockKey = "hibou-consent-replay-test";
const mockSources = {
  "next/server": "export const NextResponse = { json: (body, init) => Response.json(body, init) };",
  "../../../../lib/airtable": `
    const state = () => globalThis[Symbol.for(${JSON.stringify(mockKey)})];
    export const TABLES = state().TABLES;
    export const configMap = (...args) => state().configMap(...args);
    export const queryAllRecords = (...args) => state().queryAllRecords(...args);
    export const queryRecords = (...args) => state().queryRecords(...args);
    export const createRecord = (...args) => state().createRecord(...args);
  `,
  "../../../../lib/lemon-api.mjs": `
    const state = () => globalThis[Symbol.for(${JSON.stringify(mockKey)})];
    export const createLiveLemonCheckout = (...args) => state().createLiveLemonCheckout(...args);
    export const createTestLemonCheckout = (...args) => state().createTestLemonCheckout(...args);
  `,
};
globalThis[Symbol.for(mockKey)] = { TABLES, configMap };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === routeUrl && Object.hasOwn(mockSources, specifier)) {
      return { url: `hibou-consent-mock:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("hibou-consent-mock:")) {
      return { format: "module", source: mockSources[decodeURIComponent(url.slice("hibou-consent-mock:".length))], shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
let POST;
try { ({ POST } = await import(routeUrl)); }
finally { hooks.deregister(); }

const requestId = "11111111-1111-4111-8111-111111111111";
const liveConfig = {
  digital_supply_consent_checkout_mode: "live",
  digital_supply_consent_version: DIGITAL_SUPPLY_CONSENT_VERSION,
  commerce_launch_authorized: "true",
  digital_supply_consent_durable_confirmation_tested: "true",
  commerce_end_to_end_tested: "true",
  book_current_edition: "V1.0-early-access-2026-09",
};
const availableChapters = [{ fields: { Chapitre: "1 — Exemple", "Contenu V1": "Texte disponible." } }];

function priorConsent(mode, version = DIGITAL_SUPPLY_CONSENT_VERSION) {
  return { fields: {
    "URL résultat": `https://hibou.lemonsqueezy.com/checkout/buy/prior-${mode}`,
    "Dernière exécution": "2026-09-30T20:00:00.000Z",
    Notes: `consent_version=${version}; immediate_supply_consent=true; withdrawal_loss_ack=true; checkout_mode=${mode}; checkout_id=123`,
  } };
}

async function submit({ config = liveConfig, existing = priorConsent("live"), chapters = availableChapters } = {}) {
  const calls = [];
  globalThis[Symbol.for(mockKey)] = {
    TABLES,
    configMap,
    async queryAllRecords(table) {
      calls.push(table === TABLES.configuration ? "read_config" : "read_book");
      if (table === TABLES.configuration) return Object.entries(config).map(([Clé, Valeur]) => ({ fields: { Clé, Valeur } }));
      assert.equal(table, TABLES.book);
      return chapters;
    },
    async queryRecords(table, query) {
      calls.push("read_journal");
      assert.equal(table, TABLES.journal);
      assert.ok(query.filterByFormula.includes(requestId));
      return existing ? [existing] : [];
    },
    async createRecord(table) { calls.push("write_journal"); assert.equal(table, TABLES.journal); return { id: "recConsent" }; },
    async createLiveLemonCheckout() { calls.push("create_live"); return { id: "live-new", url: "https://hibou.lemonsqueezy.com/checkout/buy/new-live" }; },
    async createTestLemonCheckout() { calls.push("create_test"); return { id: "test-new", url: "https://hibou.lemonsqueezy.com/checkout/buy/new-test" }; },
  };
  const response = await POST(new Request("https://d4d5d6.com/api/commerce/digital-supply-consent", {
    method: "POST",
    headers: { Origin: "https://d4d5d6.com", "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId, immediate_supply_consent: true, withdrawal_loss_ack: true }),
  }));
  return { response, body: await response.json(), calls };
}

function assertRefused(result, status) {
  assert.equal(result.response.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(Object.hasOwn(result.body, "checkout_url"), false);
  assert.equal(result.calls.some((call) => call.startsWith("create_") || call.startsWith("write_")), false);
}

test("un request_id journalisé ne rend aucun ancien checkout LIVE après désactivation du parcours", async () => {
  const result = await submit({ config: { ...liveConfig, digital_supply_consent_checkout_mode: "disabled" } });
  assertRefused(result, 409);
  assert.deepEqual(result.calls, ["read_config"]);
});

for (const flag of ["commerce_launch_authorized", "digital_supply_consent_durable_confirmation_tested", "commerce_end_to_end_tested"]) {
  test(`un doublon LIVE reste refusé quand ${flag}=false`, async () => {
    const result = await submit({ config: { ...liveConfig, [flag]: "false" } });
    assertRefused(result, 412);
    assert.deepEqual(result.calls, ["read_config"]);
  });
}

test("un doublon LIVE reste refusé lorsque le livre ne contient plus de texte livrable", async () => {
  const result = await submit({ chapters: [] });
  assertRefused(result, 412);
  assert.deepEqual(result.calls, ["read_config", "read_book"]);
});

test("un ancien checkout TEST n'est pas restitué après passage en LIVE", async () => {
  assertRefused(await submit({ existing: priorConsent("test") }), 409);
});

test("un ancien checkout LIVE n'est pas restitué après passage en TEST", async () => {
  assertRefused(await submit({ config: { ...liveConfig, digital_supply_consent_checkout_mode: "test" } }), 409);
});

test("un reçu d'une autre version ou sans contexte ne peut pas être rejoué", async () => {
  for (const existing of [priorConsent("live", "DIGITAL_SUPPLY_OLD"), { fields: { "URL résultat": priorConsent("live").fields["URL résultat"] } }]) {
    assertRefused(await submit({ existing }), 409);
  }
});

for (const mode of ["test", "live"]) {
  test(`un doublon ${mode.toUpperCase()} de même version reste autorisé sans second checkout ni écriture`, async () => {
    const existing = priorConsent(mode);
    const result = await submit({ config: { ...liveConfig, digital_supply_consent_checkout_mode: mode }, existing });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { ok: true, deduplicated: true, consent_id: requestId, checkout_url: existing.fields["URL résultat"] });
    assert.equal(result.calls.some((call) => call.startsWith("create_") || call.startsWith("write_")), false);
  });
}

test("une demande LIVE nouvelle et autorisée crée son checkout puis son reçu", async () => {
  const result = await submit({ existing: null });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.mode, "live");
  assert.deepEqual(result.calls.slice(-2), ["create_live", "write_journal"]);
  for (const read of ["read_config", "read_book", "read_journal"]) assert.ok(result.calls.includes(read));
});
