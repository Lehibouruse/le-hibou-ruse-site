import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSale, digifyRecipientRequest, digifyRevokeRequest, lemonOrder, saleIsRefunded, verifyLemonSignature } from "../lib/commerce.mjs";

test("la signature Lemon est vérifiée en HMAC SHA-256 sur le body brut", () => {
  const body = Buffer.from('{"meta":{"event_name":"order_created"}}');
  const secret = "unit-test-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyLemonSignature(body, signature, secret), true);
  assert.equal(verifyLemonSignature(body, "0".repeat(64), secret), false);
});

test("une commande Lemon est normalisée sans dépendre de son nom public", () => {
  const order = lemonOrder({ meta: { event_name: "order_created" }, data: { id: "42", attributes: { user_email: "TEST@EXAMPLE.COM", currency: "EUR", total: 2900, status: "paid", first_order_item: { product_id: 9, variant_id: 10, product_name: "Guide" } } } });
  assert.equal(order.id, "42");
  assert.equal(order.email, "test@example.com");
  assert.equal(order.total, 29);
  assert.equal(order.variantId, "10");
});

test("la détection de remboursement couvre les statuts canonique et historique", () => {
  assert.equal(saleIsRefunded({ Statut: "refunded" }), true);
  assert.equal(saleIsRefunded({ Statut: "Remboursée" }), true);
  assert.equal(saleIsRefunded({ Statut: "paid", Remboursement: "2026-09-16T08:00:00Z" }), true);
  assert.equal(saleIsRefunded({ Statut: "paid", Remboursement: "Non" }), false);
});

test("la vente canonique est stable entre doublons concurrents", () => {
  const records = [
    { id: "recB", createdTime: "2026-09-16T08:00:02.000Z" },
    { id: "recA", createdTime: "2026-09-16T08:00:01.000Z" },
    { id: "recC", createdTime: "2026-09-16T08:00:01.000Z" },
  ];
  assert.equal(canonicalSale(records).id, "recA");
  assert.equal(canonicalSale([]), null);
});

test("l'ajout destinataire Digify utilise le contrat officiel form-urlencoded", () => {
  const env = {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
  };
  const request = digifyRecipientRequest({ fileGuid: "file-1", email: "BUYER@EXAMPLE.COM", orderId: "order-1" }, env);
  assert.equal(request.url, "https://svc.digify.com/v1/file/recipient/add");
  assert.equal(request.headers["Content-Type"], "application/x-www-form-urlencoded");
  const params = new URLSearchParams(request.body);
  assert.equal(params.get("Guid"), "file-1");
  assert.equal(params.get("RecipientEmail"), "buyer@example.com");
  assert.equal(params.get("Permission"), "Recipient");
  assert.throws(
    () => digifyRecipientRequest(
      { fileGuid: "f", email: "e@x.com", orderId: "o" },
      { ...env, DIGIFY_ADD_RECIPIENT_URL: "https://example.com/add" },
    ),
    /Endpoint Digify refusé/,
  );
});

test("le schéma officiel Digify est intégré et ne dépend plus de templates Vercel", () => {
  const context = { fileGuid: "f", email: "e@x.com", orderId: "o" };
  const request = digifyRecipientRequest(context, { DIGIFY_KEY_ID: "key", DIGIFY_SECRET: "secret" });
  const params = new URLSearchParams(request.body);
  assert.equal(params.get("Guid"), "f");
  assert.equal(params.get("RecipientEmail"), "e@x.com");
});

test("la révocation technique utilise la suppression officielle d'un destinataire", () => {
  const env = {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
  };
  const request = digifyRevokeRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, env);
  assert.equal(request.url, "https://svc.digify.com/v1/file/recipient/remove");
  const params = new URLSearchParams(request.body);
  assert.equal(params.get("Guid"), "file-1");
  assert.equal(params.get("RecipientEmail"), "buyer@example.com");
  assert.throws(
    () => digifyRevokeRequest(
      { fileGuid: "f", email: "e@x.com", orderId: "o" },
      { ...env, DIGIFY_REVOKE_RECIPIENT_URL: "https://example.com/revoke" },
    ),
    /Endpoint Digify refusé/,
  );
});

test("le webhook Lemon et les processeurs Digify sont séparés", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  const revoke = readFileSync(new URL("../app/api/commerce/revoke/route.js", import.meta.url), "utf8");
  assert.match(lemon, /resolveLemonWebhookSecret\(process\.env\)/);
  assert.match(lemon, /revocation_pending/);
  assert.doesNotMatch(lemon, /revokeDigifyRecipient/);
  assert.match(delivery, /addDigifyRecipient/);
  assert.match(revoke, /revokeDigifyRecipient/);
  assert.match(revoke, /revocation_not_configured/);
});

test("l'ancien endpoint Lemon délègue au handler canonique", () => {
  const legacy = readFileSync(new URL("../app/api/webhooks/lemonsqueezy/route.js", import.meta.url), "utf8");
  assert.match(legacy, /commerce\/lemon-webhook\/route/);
  assert.doesNotMatch(legacy, /createRecord|updateRecord|validSignature/);
});

test("un remboursement hors ordre crée un tombstone et order_created ne réactive jamais la livraison", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  assert.match(lemon, /refund_before_order_created=true/);
  assert.match(lemon, /order_created_after_refund=true/);
  assert.match(lemon, /"Livraison statut": "revoked"/);
  assert.match(lemon, /priorRefundMarker/);
});

test("la livraison vérifie les doublons et remboursements avant l'effet externe Digify", () => {
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  const guardAt = delivery.indexOf("deliveryOrderGuard(current)");
  const effectAt = delivery.indexOf("addDigifyRecipient({ fileGuid, email, orderId })");
  assert.ok(guardAt >= 0);
  assert.ok(effectAt > guardAt);
  assert.match(delivery, /duplicate_order_guard/);
  assert.match(delivery, /refund_guard/);
});

test("une commande test ne peut jamais passer en livraison", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  assert.match(lemon, /&& !order\.testMode/);
  assert.match(lemon, /commande Lemon en mode test: livraison bloquée/);
});

test("la livraison est bloquée sans preuve de consentement à la fourniture immédiate", () => {\n  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");\n  assert.match(lemon, /validDigitalSupplyCustomData/);\n  assert.match(lemon, /const consentValid = validDigitalSupplyCustomData/);\n  assert.match(lemon, /&& consentValid/);\n  assert.match(lemon, /consentement fourniture immédiate absent\\/invalide: livraison bloquée/);\n});\n\ntest("le kill switch commerce bloque le webhook et est revérifié avant tout effet Digify", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  assert.match(lemon, /commerce_launch_authorized/);
  assert.match(lemon, /launchAuthorized/);
  assert.match(lemon, /commerce_launch_authorized=false: livraison bloquée par kill switch/);
  const launchGuardAt = delivery.indexOf("commerceLaunchAuthorized()");
  const effectAt = delivery.indexOf("addDigifyRecipient({ fileGuid, email, orderId })");
  assert.ok(launchGuardAt >= 0);
  assert.ok(effectAt > launchGuardAt);
  assert.match(delivery, /commerce_launch_not_authorized/);
});

test("une configuration Digify incomplète n'entame aucune tentative de livraison", () => {
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  const configuredAt = delivery.indexOf("if (!configured)");
  const attemptsAt = delivery.indexOf("const attempts = Number");
  const claimAt = delivery.indexOf("commerceClaimPatch({ token, status: \"processing\", attempts })");
  assert.ok(configuredAt >= 0);
  assert.ok(attemptsAt > configuredAt);
  assert.ok(claimAt > attemptsAt);
  assert.match(delivery, /delivery_not_configured/);
});

test("la vente fige le fichier Digify et l'édition exacte avant livraison", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  assert.match(lemon, /"Digify File GUID": fileGuid/);
  assert.match(lemon, /"Version livre livrée": edition/);
  assert.match(delivery, /current\.fields\?\.\["Digify File GUID"\]/);
  assert.match(delivery, /snapshottedEdition/);
  assert.match(delivery, /Édition livre non finale/);
});

test("la livraison n'utilise jamais de lien Digify générique partagé", () => {
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(delivery, /DIGIFY_GENERIC_FILE_URL/);
  assert.match(delivery, /const url = delivered\.accessUrl \|\| ""/);
  assert.match(delivery, /Quick Access Link/);
});

test("le scheduler interroge livraison et révocation sans bloquer le Core", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  assert.match(workflow, /api\/commerce\/delivery/);
  assert.match(workflow, /api\/commerce\/revoke/);
  assert.match(workflow, /\|\| true/);
  assert.match(workflow, /app\/api\/commerce\/\*\*/);
});
