import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bookEditionAuditNote, bookEditionManifest } from "../lib/book-edition-manifest.mjs";

test("le manifeste fige l'empreinte des seuls textes réellement livrables", () => {
  const first = { fields: { Chapitre: "1 — Texte", Version: "V2-draft", "Contenu V1": "Corps principal", "Contenu V1 — suite": "Suite technique" } };
  const second = { fields: { Chapitre: "2 — Suite seule", "Contenu V1 — suite": "Contenu de la suite" } };
  const empty = { fields: { Chapitre: "3 — Vide", "Contenu V1": " " } };
  const a = bookEditionManifest([second, empty, first], "V1.0-early-access-2026-09");
  const b = bookEditionManifest([first, second, empty], "V1.0-early-access-2026-09");
  assert.equal(a.chapter_count, 2);
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.entries[0].characters, "Corps principal\n\nSuite technique".length);
  assert.match(bookEditionAuditNote(a), /edition_manifest_sha256=[a-f0-9]{64}/);
  const changed = bookEditionManifest([{ ...first, fields: { ...first.fields, "Contenu V1 — suite": "Suite modifiée" } }, second], a.edition);
  assert.notEqual(changed.sha256, a.sha256);
});

test("le webhook enregistre le manifeste et bloque un lecteur sans texte", () => {
  const webhook = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../app/lire/route.js", import.meta.url), "utf8");
  assert.match(webhook, /bookEditionManifest\(currentChapters, edition\)/);
  assert.match(webhook, /Boolean\(editionManifest\?\.chapter_count\)/);
  assert.match(webhook, /bookEditionAuditNote\(editionManifest\)/);
  assert.match(reader, /currentManifest\.sha256 !== originalManifestHash/);
});
