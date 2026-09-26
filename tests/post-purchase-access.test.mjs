import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/commerce/access/route.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/merci/page.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../components/PurchaseAccess.js", import.meta.url), "utf8");
const reader = readFileSync(new URL("../app/lire/route.js", import.meta.url), "utf8");
const readerTokens = readFileSync(new URL("../lib/secure-reader.mjs", import.meta.url), "utf8");

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
  const readerReadyAt = route.indexOf('deliveryStatus === "reader_ready"');
  const deliveredAt = route.indexOf('deliveryStatus === "delivered"');
  assert.ok(refundAt >= 0);
  assert.ok(duplicateAt > refundAt);
  assert.ok(readerReadyAt > duplicateAt);
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


test("le parcours post-achat peut créer un lien signé vers le lecteur Hibou", () => {
  assert.match(route, /createReaderToken/);
  assert.match(route, /deliveryStatus === "reader_ready"/);
  assert.match(route, /reader_url/);
  assert.match(route, /\/lire\?token=/);
  assert.match(client, /state\.status === "reader_ready"/);
  assert.match(client, /Lecture en ligne uniquement/);
});

test("le lecteur Hibou revérifie la vente et refuse les remboursements", () => {
  assert.match(reader, /verifyReaderToken/);
  assert.match(reader, /getRecord\(TABLES\.sales/);
  assert.match(reader, /saleIsRefunded/);
  assert.match(reader, /deliveryStatus !== "reader_ready"/);
  assert.match(reader, /status: 410/);
});

test("le lecteur Hibou bloque les actions ordinaires de copie, impression et sauvegarde", () => {
  assert.match(reader, /user-select:none/);
  assert.match(reader, /"copy","cut","contextmenu","dragstart"/);
  assert.match(reader, /"selectstart"/);
  assert.match(reader, /\["c","x","s","p","u","a","f"\]/);
  assert.match(reader, /@media print/);
  assert.match(reader, /Content-Disposition": "inline"/);
  assert.match(reader, /Cache-Control": "no-store/);
  assert.match(reader, /X-Robots-Tag/);
  assert.doesNotMatch(reader, /download_url/);
});

test("les jetons du lecteur sont signés et ne contiennent aucun secret serveur", () => {
  assert.match(readerTokens, /createHmac\("sha256"/);
  assert.match(readerTokens, /timingSafeEqual/);
  assert.match(readerTokens, /HIBOU_READER_SECRET/);
  assert.match(readerTokens, /CRON_SECRET/);
});
