import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialValidationPlan, socialValidationPlanFor } from "../lib/social-validation-plan.mjs";

function account(platform, fields = {}) { return { fields: { Plateforme: platform, ...fields } }; }
function gateway(provider, fields = {}) { return { provider, direct_configured: false, ...fields }; }
const ready = { "OAuth Hibou connecté": true, "Auth direct OK": true, "Lecture API OK": true };

test("YouTube autorise uniquement la préparation d'un test privé après auth + lecture", () => {
  const plan = socialValidationPlanFor("youtube", {
    accounts: [account("YouTube", ready)],
    gateways: [gateway("youtube", { direct_configured: true })],
  });
  assert.equal(plan.strategy, "NON_PUBLIC_DIRECT_TEST");
  assert.equal(plan.enforced_visibility, "private");
  assert.equal(plan.executable_nonpublic_test, true);
  assert.equal(plan.no_public_side_effect_without_explicit_approval, true);
});

test("TikTok impose SELF_ONLY pour le test contrôlé", () => {
  const plan = socialValidationPlanFor("tiktok", {
    accounts: [account("TikTok", ready)],
    gateways: [gateway("tiktok", { direct_configured: true })],
  });
  assert.equal(plan.enforced_visibility, "SELF_ONLY");
  assert.equal(plan.executable_nonpublic_test, true);
});

test("Pinterest exige en plus le Sandbox/Trial", () => {
  const blocked = socialValidationPlanFor("pinterest", {
    accounts: [account("Pinterest", ready)],
    gateways: [gateway("pinterest", { direct_configured: true })],
    config: { social_pinterest_sandbox: "false" },
  });
  assert.equal(blocked.executable_nonpublic_test, false);
  const safe = socialValidationPlanFor("pinterest", {
    accounts: [account("Pinterest", ready)],
    gateways: [gateway("pinterest", { direct_configured: true })],
    config: { social_pinterest_sandbox: "true" },
  });
  assert.equal(safe.executable_nonpublic_test, true);
});

test("Meta, Threads et LinkedIn ne déclenchent jamais automatiquement un test réel potentiellement public", () => {
  for (const [provider, platform] of [["instagram", "Instagram"], ["facebook", "Facebook"], ["threads", "Threads"], ["linkedin", "LinkedIn"]]) {
    const plan = socialValidationPlanFor(provider, {
      accounts: [account(platform, ready)],
      gateways: [gateway(provider, { direct_configured: true })],
    });
    assert.equal(plan.strategy, "EXPLICIT_PUBLIC_APPROVAL_REQUIRED");
    assert.equal(plan.executable_nonpublic_test, false);
  }
});

test("X et Snapchat restent bloqués par leur étape externe", () => {
  assert.equal(socialValidationPlanFor("x").strategy, "EXTERNAL_ACCESS_AND_SPEND_APPROVAL_REQUIRED");
  assert.equal(socialValidationPlanFor("snapchat").strategy, "EXTERNAL_PRODUCT_APPROVAL_REQUIRED");
});

test("une publication déjà testée n'est pas répétée automatiquement", () => {
  const plan = socialValidationPlanFor("youtube", {
    accounts: [account("YouTube", { ...ready, "Publication testée": true })],
    gateways: [gateway("youtube", { direct_configured: true })],
  });
  assert.equal(plan.publication_already_tested, true);
  assert.equal(plan.executable_nonpublic_test, false);
});

test("le résumé du plan couvre tous les réseaux", () => {
  const plan = buildSocialValidationPlan();
  assert.equal(plan.summary.total, 9);
  assert.equal(plan.summary.explicit_public_approval_required, 4);
  assert.equal(plan.summary.external_blocked, 2);
});
