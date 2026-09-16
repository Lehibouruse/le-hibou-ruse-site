import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflowPaths = [
  "domain-verify.yml",
  "social-metrics.yml",
  "system-watchdog.yml",
];

function workflow(name) {
  return readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

test("les endpoints planifiés tolèrent seulement une propagation 404 bornée", () => {
  for (const name of workflowPaths) {
    const source = workflow(name);
    assert.match(source, /for attempt in 1 2 3/);
    assert.match(source, /sleep 15/);
    assert.match(source, /Persistent 404 after deployment grace window/);
  }
});

test("un 404 persistant n'est jamais classé comme succès", () => {
  const domain = workflow("domain-verify.yml");
  const metrics = workflow("social-metrics.yml");
  const watchdog = workflow("system-watchdog.yml");

  assert.match(domain, /if \[ "\$http_code" = "404" \]; then[\s\S]*?exit 1/);
  assert.match(watchdog, /if \[ "\$code" = "404" \]; then[\s\S]*?exit 1/);
  assert.doesNotMatch(metrics, /200\|201\|202\|204\|404/);
  assert.match(metrics, /if \[ "\$http_code" = "404" \]; then[\s\S]*?return 1/);
});
