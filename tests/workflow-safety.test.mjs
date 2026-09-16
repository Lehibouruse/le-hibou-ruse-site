import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("un push main d'infrastructure self-teste le wake en dry-run tandis que le schedule reste réel", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  const dryRunLine = workflow.split(/\r?\n/).find((line) => line.includes("DRY_RUN:")) || "";
  assert.match(dryRunLine, /github\.event_name == 'push'/);
  assert.match(dryRunLine, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(dryRunLine, /github\.event_name == 'schedule'/);
  assert.match(workflow, /- cron: "\*\/5 \* \* \* \*"/);
});
