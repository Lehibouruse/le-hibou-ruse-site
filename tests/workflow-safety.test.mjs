import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
const revoke = readFileSync(new URL("../app/api/commerce/revoke/route.js", import.meta.url), "utf8");
const commerceQueue = readFileSync(new URL("../.github/workflows/commerce-queue.yml", import.meta.url), "utf8");

test("un push main d'infrastructure self-teste le wake en dry-run tandis que le wake payant reste manuel", () => {
  const dryRunLine = workflow.split(/\r?\n/).find((line) => line.includes("DRY_RUN:")) || "";
  assert.match(dryRunLine, /github\.event_name == 'push'/);
  assert.match(dryRunLine, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(dryRunLine, /github\.event_name == 'schedule'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*schedule:\s*\n/);
  assert.doesNotMatch(workflow, /\*\/5 \* \* \* \*/);
  assert.match(workflow, /Automatic paid-agent scheduling is intentionally disabled/);
});

test("un dry-run ne peut jamais appeler les routes Digify à effet externe", () => {
  assert.match(workflow, /if \[ "\$DRY_RUN" = "true" \]; then/);
  assert.match(workflow, /delivery=%s\\n' "skipped_dry_run"/);
  assert.match(workflow, /revocation=%s\\n' "skipped_dry_run"/);
  const guardIndex = workflow.indexOf('if [ "$DRY_RUN" = "true" ]; then');
  const deliveryIndex = workflow.indexOf('post_commerce_effect "delivery" "/api/commerce/delivery"');
  const revokeIndex = workflow.indexOf('post_commerce_effect "revocation" "/api/commerce/revoke"');
  const elseIndex = workflow.indexOf("else", guardIndex);
  assert(guardIndex >= 0 && elseIndex > guardIndex);
  assert(deliveryIndex > elseIndex);
  assert(revokeIndex > elseIndex);
});

test("delivery et revoke refusent explicitement l'événement push même si le workflow régresse", () => {
  for (const source of [delivery, revoke]) {
    assert.match(source, /OIDC_WORKFLOW = "hibou-wake\.yml"/);
    assert.match(source, /ALLOWED_EVENTS = \["schedule", "workflow_dispatch"\]/);
    assert.match(source, /allowedWorkflowFiles: \[OIDC_WORKFLOW, COMMERCE_WORKFLOW\]/);
    assert.match(source, /allowedEvents: ALLOWED_EVENTS/);
    assert.doesNotMatch(source, /allowedEvents:.*push/);
  }
});

test("les effets commerce réels échouent franchement sur panne transport ou HTTP", () => {
  assert.match(workflow, /post_commerce_effect\(\)/);
  assert.match(workflow, /commerce\/delivery/);
  assert.match(workflow, /commerce\/revoke/);
  assert.match(workflow, /transport failure/);
  assert.match(workflow, /HTTP failure/);
  assert.match(workflow, /200\|201\|202\|204\|409\|422/);
});


test("la file commerce traite automatiquement livraison et révocation sans réveiller l’agent éditorial", () => {
  assert.match(commerceQueue, /schedule:/);
  assert.match(commerceQueue, /\*\/5 \* \* \* \*/);
  assert.match(commerceQueue, /id-token: write/);
  assert.match(commerceQueue, /api\/commerce\/\$\{endpoint\}/);
  assert.match(commerceQueue, /call_commerce_endpoint revoke/);\n  assert.match(commerceQueue, /call_commerce_endpoint delivery/);
  assert.doesNotMatch(commerceQueue, /api\/wake|api\/agent-worker/);
});
