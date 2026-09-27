import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);
const promote = readFileSync(
  new URL("../scripts/video-storyboard-promote.mjs", import.meta.url),
  "utf8",
);
const render = readFileSync(
  new URL("../scripts/video-local-render.mjs", import.meta.url),
  "utf8",
);
const qc = readFileSync(
  new URL("../scripts/video-master-qc.mjs", import.meta.url),
  "utf8",
);
const registry = readFileSync(
  new URL("../scripts/video-artifact-registry.mjs", import.meta.url),
  "utf8",
);

test("video-master downloads post-render scripts from immutable runtime commit", () => {
  assert.match(master, /POST_RUNTIME_FILES/);
  assert.match(master, /LeHibou","post-runtime",normalized/);
  assert.match(master, /raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/\$\{normalized\}\/scripts\/\$\{name\}/);
  assert.match(master, /postRuntime\.promote/);
  assert.match(master, /postRuntime\.render/);
  assert.match(master, /postRuntime\.masterQc/);
  assert.match(master, /postRuntime\.registry/);
});

test("post-render entrypoints are portable on Windows", () => {
  for (const source of [promote, render, qc, registry]) {
    assert.match(source, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
    assert.doesNotMatch(source, /file:\/\/\$\{process\.argv\[1\]\}/);
  }
});

test("dry-run Airtable report is skipped instead of calling local sync script", () => {
  assert.match(master, /report-airtable disabled; queue worker owns final status/);
  assert.match(master, /airtable_report_mode="dry_run_skipped"/);
});
