import assert from "node:assert/strict";
import test from "node:test";
import { assessDomainIdentity, domainConfigPatch } from "../lib/domain-verification.mjs";

test("identité canonique exacte valide le domaine", () => {
  const result = assessDomainIdentity({
    status: 200,
    ok: true,
    marker: "le-hibou-ruse",
    data: { site: "Le Hibou Rusé", canonical: true, received_host: "d4d5d6.com" },
  });
  assert.equal(result.state, "verified");
  assert.equal(result.verified, true);
});

test("404 ou absence d'identité reste pending et ne doit pas révoquer", () => {
  assert.equal(assessDomainIdentity({ status: 404, ok: false, marker: "", data: {} }).state, "pending");
  assert.equal(assessDomainIdentity({ status: 200, ok: true, marker: "", data: {} }).state, "pending");
  assert.equal(domainConfigPatch("pending", "x"), null);
});

test("mauvaise identité explicite invalide un état stale", () => {
  const result = assessDomainIdentity({
    status: 200,
    ok: true,
    marker: "autre-site",
    data: { site: "Autre site", canonical: false, received_host: "d4d5d6.com" },
  });
  assert.equal(result.state, "mismatch");
  const patch = domainConfigPatch(result.state, result.reason, "2026-09-15");
  assert.equal(patch.Valeur, "false");
  assert.equal(patch.Statut, "En attente");
  assert.equal(patch["Dernière modification"], "2026-09-15");
  assert.ok(!Object.hasOwn(patch, "Dernière vérification"));
});

test("patch de succès utilise le vrai champ Configuration", () => {
  const patch = domainConfigPatch("verified", "identity_match", "2026-09-15");
  assert.deepEqual(patch, {
    Valeur: "true",
    Statut: "Actif",
    Erreur: "",
    "Dernière modification": "2026-09-15",
  });
});
