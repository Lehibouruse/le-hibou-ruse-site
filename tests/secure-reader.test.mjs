import assert from "node:assert/strict";
import test from "node:test";
import { signReaderToken, resolveReaderSecret, verifyReaderToken } from "../lib/secure-reader.mjs";

test("un jeton lecteur signé se vérifie et conserve uniquement l'identité minimale", () => {
  const env = { CRON_SECRET: "root-secret" };
  const token = signReaderToken({
    saleId: "rec123",
    orderIdentifier: "11111111-1111-4111-8111-111111111111",
    edition: "V1.0-2026-09",
  }, env);
  const decoded = verifyReaderToken(token, env);
  assert.deepEqual(decoded, {
    saleId: "rec123",
    orderIdentifier: "11111111-1111-4111-8111-111111111111",
    edition: "V1.0-2026-09",
  });
  assert.equal(token.includes("root-secret"), false);
});

test("la modification d'un jeton lecteur invalide sa signature", () => {
  const env = { CRON_SECRET: "root-secret" };
  const token = signReaderToken({
    saleId: "rec123",
    orderIdentifier: "11111111-1111-4111-8111-111111111111",
  }, env);
  const [payload, signature] = token.split(".");
  const tampered = `${payload.slice(0, -1)}A.${signature}`;
  assert.equal(verifyReaderToken(tampered, env), null);
});

test("un secret lecteur dédié prend le pas sur le secret racine", () => {
  const explicit = resolveReaderSecret({ HIBOU_READER_SECRET: "reader-only", CRON_SECRET: "root" });
  const derived = resolveReaderSecret({ CRON_SECRET: "root" });
  assert.equal(explicit, "reader-only");
  assert.notEqual(derived, "root");
  assert.notEqual(derived, explicit);
  assert.ok(derived.length > 30);
});

test("aucun jeton ne peut être créé sans secret serveur", () => {
  assert.throws(() => signReaderToken({ saleId: "rec123", orderIdentifier: "o" }, {}), /Secret lecteur absent/);
  assert.equal(verifyReaderToken("bad.token", {}), null);
});
