import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialRoutingPlan, socialRouteFor } from "../lib/social-routing-plan.mjs";

function account(platform, fields = {}) {
  return { fields: { Plateforme: platform, ...fields } };
}

function gateway(provider, fields = {}) {
  return { provider, direct_configured: false, webhook_configured: false, missing_direct_env: [], ...fields };
}

test("publication directe exige un OAuth réellement testé et une publication testée", () => {
  const route = socialRouteFor("youtube", {
    operation: "publish",
    accounts: [account("YouTube", {
      "OAuth Hibou connecté": true,
      "Auth direct OK": true,
      "Lecture API OK": true,
      "Publication testée": true,
    })],
    gateways: [gateway("youtube", { direct_configured: true })],
  });
  assert.equal(route.route, "direct_api");
  assert.equal(route.autonomous_runtime, true);
  assert.equal(route.direct_ready, true);
});

test("un compte Metricool réellement testé reste pilotable depuis ChatGPT avant OAuth direct", () => {
  const route = socialRouteFor("instagram", {
    operation: "publish",
    accounts: [account("Instagram", {
      "Metricool vérifié": true,
      "Metricool test réel": true,
      "Pilotable depuis ChatGPT": true,
      "OAuth Hibou connecté": false,
      "Phase autorisation": "SERVER_SECRETS_REQUIRED",
    })],
    gateways: [gateway("instagram")],
  });
  assert.equal(route.route, "chatgpt_metricool");
  assert.equal(route.ready, true);
  assert.equal(route.autonomous_runtime, false);
  assert.equal(route.execution_context, "chatgpt_connector");
  assert.equal(route.metricool_real_tested, true);
});

test("une simple déclaration Metricool ne suffit plus sans preuve réelle du connecteur", () => {
  const route = socialRouteFor("instagram", {
    operation: "publish",
    accounts: [account("Instagram", {
      "Metricool vérifié": true,
      "Metricool test réel": false,
      "Pilotable depuis ChatGPT": true,
    })],
    gateways: [gateway("instagram")],
  });
  assert.equal(route.metricool_declared_verified, true);
  assert.equal(route.metricool_real_tested, false);
  assert.equal(route.route, "blocked");
});

test("un webhook HTTPS configuré prime sur Metricool pour le runtime autonome", () => {
  const route = socialRouteFor("facebook", {
    operation: "publish",
    accounts: [account("Facebook", { "Metricool vérifié": true, "Metricool test réel": true, "Pilotable depuis ChatGPT": true })],
    gateways: [gateway("facebook", { webhook_configured: true })],
  });
  assert.equal(route.route, "webhook_fallback");
  assert.equal(route.autonomous_runtime, true);
});

test("lecture directe ne prétend pas que la publication est validée", () => {
  const route = socialRouteFor("linkedin", {
    operation: "read",
    accounts: [account("LinkedIn", {
      "OAuth Hibou connecté": true,
      "Auth direct OK": true,
      "Lecture API OK": true,
      "Publication testée": false,
    })],
    gateways: [gateway("linkedin", { direct_configured: true })],
  });
  assert.equal(route.route, "direct_api");
  assert.equal(route.read_tested, true);
  assert.equal(route.publish_tested, false);
});

test("analytics direct exige Analytics OK et sinon peut utiliser Metricool", () => {
  const route = socialRouteFor("youtube", {
    operation: "analytics",
    accounts: [account("YouTube", {
      "OAuth Hibou connecté": true,
      "Auth direct OK": true,
      "Lecture API OK": true,
      "Analytics OK": false,
      "Metricool vérifié": true,
      "Metricool test réel": true,
      "Pilotable depuis ChatGPT": true,
    })],
    gateways: [gateway("youtube", { direct_configured: true })],
  });
  assert.equal(route.direct_ready, false);
  assert.equal(route.route, "chatgpt_metricool");
});

test("un blocage externe est explicite quand aucune voie n'existe", () => {
  const route = socialRouteFor("snapchat", {
    operation: "publish",
    accounts: [account("Snapchat", { "Blocage externe final": "Approbation Snap Public Profile requise" })],
    gateways: [gateway("snapchat")],
  });
  assert.equal(route.route, "blocked");
  assert.match(route.blocker, /Approbation Snap/);
});

test("le résumé distingue direct, webhook, Metricool et blocages", () => {
  const plan = buildSocialRoutingPlan({
    operation: "publish",
    accounts: [
      account("YouTube", { "OAuth Hibou connecté": true, "Auth direct OK": true, "Publication testée": true }),
      account("Instagram", { "Metricool vérifié": true, "Metricool test réel": true, "Pilotable depuis ChatGPT": true }),
    ],
    gateways: [
      gateway("youtube", { direct_configured: true }),
      gateway("facebook", { webhook_configured: true }),
    ],
  });
  assert.equal(plan.summary.total, 9);
  assert.equal(plan.summary.direct, 1);
  assert.equal(plan.summary.webhook, 1);
  assert.equal(plan.summary.metricool, 1);
  assert.equal(plan.summary.blocked, 6);
});
