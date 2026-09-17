import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/commerce/access/route.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/merci/page.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../components/PurchaseAccess.js", import.meta.url), "utf8");

test("l'accès post-achat exige un order_identifier Lemon de forme UUID", () => {
  assert.match(route, /UUID_RE/);
  assert.match(route, /invalid_order/);
  assert.match(route, /identifier=\$\{orderIdentifier\}/);
});

test("une vente inconnue ne révèle pas l'existence d'une commande", () => {
  assert.match(route, /if \(!matches\.length\) return response\(\{ ok: true, status: "processing" \}, 202\)/);
  assert.doesNotMatch(route, /Email client/);
});

test("remboursement et doublons gagnent avant toute exposition de lien", () => {
  const refundAt = route.indexOf("matches.some((record) => saleIsRefunded(record.fields))");
  const duplicateAt = route.indexOf("matches.length !== 1");
  const deliveredAt = route.indexOf('deliveryStatus === "delivered"');
  assert.ok(refundAt >= 0);
  assert.ok(duplicateAt > refundAt);
  assert.ok(deliveredAt > duplicateAt);
  assert.match(route, /status: "revoked", reason: "refunded"/);
  assert.match(route, /status: "manual_review"/);
});

test("le lien lecteur n'est rendu qu'après livraison et reste borné à Digify HTTPS", () => {
  assert.match(route, /deliveryStatus === "delivered"/);
  assert.match(route, /url\.protocol !== "https:"/);
  assert.match(route, /host !== "digify\.com" && !host\.endsWith\("\.digify\.com"\)/);
  assert.match(route, /access_url: accessUrl/);
  assert.match(route, /saleIsRefunded/);
});

test("la page merci est non indexable et se met à jour automatiquement", () => {
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /PurchaseAccess/);
  assert.match(page, /params\?\.order/);
  assert.match(client, /\/api\/commerce\/access\?order=/);
  assert.match(client, /window\.setTimeout\(poll, POLL_MS\)/);
  assert.match(client, /Lire mon guide/);
  assert.match(client, /rel="noreferrer"/);
});
