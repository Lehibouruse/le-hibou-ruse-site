import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialAuthorizationQueue } from "../lib/social-authorization-queue.mjs";

function provider(name, phase, extra = {}) {
  return {
    provider: name,
    label: name,
    phase,
    ready_for_human_approval: phase === "HUMAN_OAUTH_APPROVAL_REQUIRED",
    airtable_platforms: [name],
    required_env_names: [],
    missing_env_names: [],
    ...extra,
  };
}

test("un provider prêt pour OAuth passe avant une configuration externe", () => {
  const queue = buildSocialAuthorizationQueue({ providers: [
    provider("youtube", "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED"),
    provider("meta", "HUMAN_OAUTH_APPROVAL_REQUIRED", { oauth_start_path: "/api/social/oauth/meta/start" }),
  ] });
  assert.equal(queue.next.provider, "meta");
  assert.equal(queue.next.state, "READY_FOR_USER");
});

test("une reconnexion OAuth expirée est identifiée et priorisée", () => {
  const queue = buildSocialAuthorizationQueue({ providers: [
    provider("meta", "AUTHORIZED", { credential_needs_reauth: true, credential_status: "Needs reauth", next_action: "Reconnecter Meta." }),
    provider("youtube", "HUMAN_OAUTH_APPROVAL_REQUIRED"),
  ] });
  assert.equal(queue.next.provider, "meta");
  assert.equal(queue.next.phase, "HUMAN_OAUTH_REAUTH_REQUIRED");
  assert.equal(queue.next.reauth_required, true);
  assert.equal(queue.next.instruction, "Reconnecter Meta.");
  assert.equal(queue.summary.reauth_required, 1);
});

test("les providers autorisés vont en fin de file", () => {
  const queue = buildSocialAuthorizationQueue({ providers: [
    provider("meta", "AUTHORIZED", { credential_connected: true }),
    provider("youtube", "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED"),
  ] });
  assert.equal(queue.steps.at(-1).provider, "meta");
  assert.equal(queue.summary.completed, 1);
});

test("Meta conserve les réseaux couverts pour éviter une double configuration", () => {
  const queue = buildSocialAuthorizationQueue({ providers: [
    provider("meta", "EXTERNAL_META_APP_SETUP_REQUIRED", { airtable_platforms: ["Instagram", "Facebook"] }),
  ] });
  assert.deepEqual(queue.steps[0].networks_covered, ["Instagram", "Facebook"]);
});

test("X reste une configuration externe tant que l'accès/coût n'est pas validé", () => {
  const queue = buildSocialAuthorizationQueue({ providers: [provider("x", "EXTERNAL_X_API_ACCESS_AND_BILLING_APPROVAL_REQUIRED")] });
  assert.equal(queue.steps[0].state, "EXTERNAL_SETUP_REQUIRED");
  assert.equal(queue.steps[0].ready_for_user, false);
});
