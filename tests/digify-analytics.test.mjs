import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const webhook = readFileSync(new URL("../app/api/commerce/digify-webhook/route.js", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");

test("le webhook Digify exige une Basic Auth indépendante de la clé API", () => {
  assert.match(webhook, /DIGIFY_WEBHOOK_USERNAME/);
  assert.match(webhook, /DIGIFY_WEBHOOK_PASSWORD/);
  assert.doesNotMatch(webhook, /DIGIFY_KEY_ID/);
  assert.doesNotMatch(webhook, /DIGIFY_SECRET/);
});

test("seuls View Print Download sont journalisés comme activité lecteur", () => {
  assert.match(webhook, /\["View", "Print", "Download"\]/);
  assert.match(webhook, /Première consultation/);
  assert.match(webhook, /Vues Digify/);
  assert.match(webhook, /Impressions Digify/);
  assert.match(webhook, /Téléchargements Digify/);
});

test("le webhook Digify refuse tout rattachement sans email destinataire nominatif", () => {
  assert.match(webhook, /RecipientUserEmail/);
  assert.match(webhook, /if \(!event\.email\)/);
  assert.match(webhook, /missing_recipient_email/);
  assert.match(webhook, /\{Digify recipient email\}='\$\{escapeFormula\(event\.email\)\}'/);
});

test("un lien remonté par Digify doit rester HTTPS sur digify.com ou un sous-domaine", () => {
  assert.match(webhook, /function safeDigifyLink/);
  assert.match(webhook, /url\.protocol !== "https:"/);
  assert.match(webhook, /host !== "digify\.com" && !host\.endsWith\("\.digify\.com"\)/);
  assert.match(webhook, /Invalid Digify link/);
  assert.match(webhook, /Lien Digify webhook hors domaine HTTPS Digify refusé/);
});

test("Print et Download sont des alertes de politique, pas une activité normale", () => {
  assert.match(webhook, /event\.type === "Print" \|\| event\.type === "Download"/);
  assert.match(webhook, /"Policy Alert"/);
  assert.match(webhook, /désactive impression\/téléchargement/);
  assert.match(webhook, /policy_alert: policyViolation/);
});

test("une livraison mémorise le fichier et l'édition exacts", () => {
  assert.match(delivery, /"Digify File GUID": fileGuid/);
  assert.match(delivery, /"Version livre livrée": edition/);
  assert.match(delivery, /book_current_edition/);
});
