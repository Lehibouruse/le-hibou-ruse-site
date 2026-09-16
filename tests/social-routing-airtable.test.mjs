import test from "node:test";
import assert from "node:assert/strict";
import { oauthHealthFields, oauthLifecycleFields, routeFieldsForProvider, routeTransition, stateTransition } from "../lib/social-routing-airtable.mjs";

test("projette les trois routes opérationnelles dans les champs Airtable", () => {
  const plans = {
    read: { routes: [{ provider: "youtube", route: "direct_api" }] },
    publish: { routes: [{ provider: "youtube", route: "chatgpt_metricool" }] },
    analytics: { routes: [{ provider: "youtube", route: "blocked" }] },
  };
  assert.deepEqual(routeFieldsForProvider("youtube", plans), {
    "Route lecture": "direct_api",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  });
});

test("une route absente reste bloquée par défaut", () => {
  assert.deepEqual(routeFieldsForProvider("snapchat", {}), {
    "Route lecture": "blocked",
    "Route publication": "blocked",
    "Route analytics": "blocked",
  });
});

test("projette la santé OAuth sans exposer le credential", () => {
  const fields = oauthHealthFields("youtube", [{
    provider: "youtube",
    vault_status: "Needs reauth",
    credential_expires_at: "2026-09-20T10:00:00.000Z",
    vault_last_error: "invalid_grant",
    credential_scopes: "secret-like-but-not-requested-here",
  }]);
  assert.deepEqual(fields, {
    "Statut OAuth coffre": "Needs reauth",
    "Expiration OAuth": "2026-09-20T10:00:00.000Z",
    "Erreur OAuth": "invalid_grant",
  });
  assert.equal(JSON.stringify(fields).includes("secret-like"), false);
});

test("Needs reauth devient une étape humaine explicite dans Airtable", () => {
  const fields = oauthLifecycleFields("youtube", [{
    provider: "youtube",
    vault_status: "Needs reauth",
    vault_last_error: "invalid_grant",
  }]);
  assert.equal(fields["Phase autorisation"], "HUMAN_OAUTH_REAUTH_REQUIRED");
  assert.equal(fields["Prêt validation humaine"], true);
  assert.match(fields["Action humaine restante"], /Reconnecter youtube/);
  assert.match(fields["Action humaine restante"], /invalid_grant/);
});

test("un credential normal ne remplace pas la phase calculée par le control plane", () => {
  assert.deepEqual(oauthLifecycleFields("youtube", [{ provider: "youtube", vault_status: "Connected" }]), {});
});

test("détecte uniquement les transitions réelles pour éviter les écritures périodiques inutiles", () => {
  assert.deepEqual(routeTransition({
    "Route lecture": "chatgpt_metricool",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  }, {
    "Route lecture": "direct_api",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  }), {
    "Route lecture": { from: "chatgpt_metricool", to: "direct_api" },
  });
});

test("les changements OAuth déclenchent une réconciliation même sans changement de route", () => {
  assert.deepEqual(stateTransition({
    "Route lecture": "chatgpt_metricool",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "chatgpt_metricool",
    "Statut OAuth coffre": "Connected",
    "Expiration OAuth": "2026-09-20T10:00:00.000Z",
    "Erreur OAuth": "",
  }, {
    "Route lecture": "chatgpt_metricool",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "chatgpt_metricool",
    "Statut OAuth coffre": "Needs reauth",
    "Expiration OAuth": "2026-09-20T10:00:00.000Z",
    "Erreur OAuth": "invalid_grant",
    "Phase autorisation": "HUMAN_OAUTH_REAUTH_REQUIRED",
    "Prêt validation humaine": true,
    "Action humaine restante": "Reconnecter youtube via /admin/social. Motif: invalid_grant",
  }), {
    "Statut OAuth coffre": { from: "Connected", to: "Needs reauth" },
    "Erreur OAuth": { from: "", to: "invalid_grant" },
    "Phase autorisation": { from: "", to: "HUMAN_OAUTH_REAUTH_REQUIRED" },
    "Prêt validation humaine": { from: "false", to: "true" },
    "Action humaine restante": { from: "", to: "Reconnecter youtube via /admin/social. Motif: invalid_grant" },
  });
});

test("un état identique est idempotent", () => {
  const current = {
    "Route lecture": "blocked",
    "Route publication": "blocked",
    "Route analytics": "blocked",
    "Statut OAuth coffre": "",
    "Expiration OAuth": null,
    "Erreur OAuth": "",
  };
  assert.deepEqual(stateTransition(current, current), {});
});
