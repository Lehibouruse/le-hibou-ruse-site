import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { protectReaderHtml, protectedReaderResponse, readerDeniedResponse } from "../lib/reader-response.mjs";

const preview = readFileSync(new URL("../app/apercu-lecteur/route.js", import.meta.url), "utf8");
const reader = readFileSync(new URL("../app/lire/route.js", import.meta.url), "utf8");
const robots = readFileSync(new URL("../app/robots.js", import.meta.url), "utf8");

test("l’aperçu exige une session QA signée créée après authentification propriétaire", () => {
  assert.match(preview, /adminCredentialsAuthorized/);
  assert.match(preview, /derivedCredentialsAuthorized/);
  assert.match(preview, /PREVIEW_RECOVERY_DIGEST/);
  assert.doesNotMatch(preview, /Hibou-QA-Jxk3KZ2vW4tXPdT-0opY/);
  assert.match(preview, /signReaderPreviewToken/);
  assert.match(preview, /verifyReaderPreviewToken/);
  assert.match(preview, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(preview, /<form method="post" action="\/apercu-lecteur"/);
  assert.doesNotMatch(preview, /WWW-Authenticate/);
  assert.match(preview, /form-action 'self'/);
  assert.match(preview, /Max-Age=/);
  assert.doesNotMatch(preview, /searchParams\.get\(["']token/);
});

test("le formulaire refuse les origines croisées et les corps surdimensionnés", () => {
  assert.match(preview, /sameOriginFormRequest\(request\)/);
  assert.match(preview, /contentLength > 4096/);
  assert.match(preview, /status: 403/);
  assert.match(preview, /status: 413/);
});

test("l’aperçu ne lit ni n’écrit aucune vente et reprend le même moteur protégé que le lecteur client", () => {
  assert.match(preview, /protectedReaderResponse/);
  assert.match(reader, /protectedReaderResponse/);
  assert.doesNotMatch(preview, /TABLES\.sales|getRecord|createRecord|updateRecord|Lemon/i);
  assert.match(preview, /published|book_current_edition/);
  assert.match(robots, /\/apercu-lecteur/);
  assert.match(robots, /\/lire/);
});

test("les réponses du lecteur sont privées, non indexables et résistantes à l’exfiltration ordinaire", async () => {
  const denied = readerDeniedResponse("Refus", 403);
  assert.match(denied.headers.get("cache-control"), /no-store/);
  assert.match(denied.headers.get("x-robots-tag"), /noindex/);
  assert.equal(denied.headers.get("referrer-policy"), "no-referrer");
  assert.equal(denied.headers.get("x-frame-options"), "DENY");

  const protectedHtml = protectReaderHtml("<html><head></head><body><main class=\"book\">secret</main></body></html>", {
    watermark: "APERÇU QA PRIVÉ",
    edition: "V1-test",
  });
  assert.match(protectedHtml, /APERÇU QA PRIVÉ/);
  assert.match(protectedHtml, /user-select:none/);
  assert.match(protectedHtml, /@media print/);
  assert.match(protectedHtml, /data-reader-size="up"/);
  assert.match(protectedHtml, /hibou-reader-status/);
  assert.match(protectedHtml, /Page 1 \/ 1/);
  assert.match(protectedHtml, /pinch-zoom/);
  assert.match(protectedHtml, /sessionStorage/);
  assert.doesNotMatch(protectedHtml, /rotate\(-28deg\)|hibou-reader-watermark/);

  const response = protectedReaderResponse({
    chapters: [{ fields: { Chapitre: "1 — Test", "Contenu V1": "Contenu QA" } }],
    edition: "V1-test",
    watermark: "APERÇU QA PRIVÉ",
    generatedAt: "2026-10-03T00:00:00Z",
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(await response.text(), /viewport/);
});
