import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const worker = readFileSync(new URL("../scripts/hibou-github-worker.mjs", import.meta.url), "utf8");
const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const definitions = worker.slice(worker.indexOf("function stableStoryboard("), worker.indexOf("function pipelineFailureDetail("));
const processStart = worker.indexOf("async function processVideoRender(");
const comparisonStart = worker.indexOf("  const storyboardPath =", processStart);
const comparisonEnd = worker.indexOf("  let sourceSnapshotPath =", comparisonStart);
const migrationStart = worker.indexOf("  if (existsSync(pipelineStatePath) && existingStoryboard)", comparisonEnd);
const migrationEnd = worker.indexOf("  const productionMode =", migrationStart);
const context = vm.createContext({ existsSync, readFileSync, writeFileSync, path, sha256, log() {} });
vm.runInContext(definitions, context);
const compare = vm.runInContext(`(job, dir) => { ${worker.slice(comparisonStart, comparisonEnd)} return { storyboardPath, pipelineStatePath, existingStoryboardPath, existingStoryboard }; }`, context);
const migrate = vm.runInContext(`({storyboardPath, pipelineStatePath, existingStoryboardPath, existingStoryboard}, job) => { ${worker.slice(migrationStart, migrationEnd)} }`, context);
const put = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const get = file => JSON.parse(readFileSync(file, "utf8"));

function fixture(t, { legacy = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "hibou-worker-resume-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const storyboardPath = path.join(dir, "storyboard.json");
  const sourcePath = path.join(dir, "source-storyboard.json");
  const statePath = path.join(dir, "pipeline-run.json");
  const freshnessPath = path.join(dir, "airtable-source-freshness.json");
  const source = { content: { source: "airtable", content_id: "rec8lgQT8jXreflmt" }, scenes: [{ scene_id: "S01", narration: "voix originale", image_prompt: "bank interior" }] };
  const derived = structuredClone(source);
  derived.prompt_contract_v2 = { contract_sha256: "verified-contract" };
  derived.scenes[0].timeline = { events: [{ id: "compiled", type: "camera" }] };
  derived.scenes[0].audio = { path: "preserved-voice.wav", duration_s: 4 };
  put(sourcePath, source);
  put(storyboardPath, legacy ? source : derived);
  const pipeline = { schema: "HIBOU_VIDEO_MASTER_RUN_V1", stages: { storyboard: { status: "PASS" }, prosody: { status: "PASS" }, voice: { status: "PASS" }, images: { status: "RUNNING" } }, inputs: { source: { type: "file", path: storyboardPath, sha256: sha256(sourcePath) }, binding: { sha256: "unchanged-binding" }, policy: { max_scenes: 16 } } };
  if (!legacy) pipeline.source_storyboard = { path: sourcePath, sha256: sha256(sourcePath), immutable: true };
  put(statePath, pipeline);
  put(freshnessPath, { schema: "HIBOU_AIRTABLE_SOURCE_FRESHNESS_V1", pass: true, immutable_source: true, verified_storyboard_path: sourcePath, verified_storyboard_sha256: sha256(sourcePath) });
  return { dir, storyboardPath, sourcePath, statePath, freshnessPath, source };
}

test("worker resumes a derived storyboard without overwriting the immutable source or voice state", t => {
  const f = fixture(t);
  const beforeDerived = sha256(f.storyboardPath), beforeSource = sha256(f.sourcePath);
  const incoming = structuredClone(f.source);
  incoming.content.exported_at = "new server export timestamp";
  const result = compare({ id: "same-job", storyboard: incoming }, f.dir);
  assert.equal(result.existingStoryboardPath, f.sourcePath);
  assert.equal(sha256(f.storyboardPath), beforeDerived);
  assert.equal(sha256(f.sourcePath), beforeSource);
  const originalState = get(f.statePath);
  migrate(result, { id: "same-job" });
  const migrated = get(f.statePath);
  assert.equal(migrated.inputs.source.sha256, beforeDerived);
  assert.deepEqual(migrated.stages, originalState.stages);
  assert.deepEqual({ ...migrated.inputs, source: originalState.inputs.source }, originalState.inputs);
  assert.equal(migrated.retry_migration.reason, "verified_immutable_source_derived_storyboard_resume");
});

test("worker rejects changed incoming semantics before writing any storyboard", t => {
  const f = fixture(t);
  const before = sha256(f.storyboardPath);
  for (const change of [s => { s.scenes[0].narration = "changed"; }, s => { s.scenes[0].image_prompt = "changed"; }, s => { s.scenes.push({ scene_id: "S02" }); }]) {
    const incoming = structuredClone(f.source); change(incoming);
    assert.throws(() => compare({ storyboard: incoming }, f.dir), /storyboard changed for an existing job id/);
    assert.equal(sha256(f.storyboardPath), before);
  }
});

test("an altered immutable source cannot fall back to the matching derived storyboard", t => {
  const f = fixture(t);
  writeFileSync(f.sourcePath, readFileSync(f.sourcePath, "utf8") + " ");
  assert.throws(() => compare({ storyboard: get(f.storyboardPath) }, f.dir), /immutable source storyboard missing or changed/);
});

test("immutable source metadata and freshness receipts must match the exact verified source", async t => {
  for (const [name, change, pattern] of [
    ["wrong source path", f => { const s = get(f.statePath); s.source_storyboard.path = path.join(f.dir, "other.json"); put(f.statePath, s); }, /immutable source storyboard/],
    ["missing source", f => rmSync(f.sourcePath), /immutable source storyboard/],
    ["false immutable marker", f => { const s = get(f.statePath); s.source_storyboard.immutable = false; put(f.statePath, s); }, /immutable source storyboard/],
    ["reset storyboard stage", f => { const s = get(f.statePath); s.stages.storyboard.status = "RUNNING"; put(f.statePath, s); }, /immutable source storyboard/],
    ["failed freshness", f => { const r = get(f.freshnessPath); r.pass = false; put(f.freshnessPath, r); }, /freshness receipt mismatched/],
    ["wrong receipt hash", f => { const r = get(f.freshnessPath); r.verified_storyboard_sha256 = "0".repeat(64); put(f.freshnessPath, r); }, /freshness receipt mismatched/],
    ["wrong receipt path", f => { const r = get(f.freshnessPath); r.verified_storyboard_path = f.storyboardPath; put(f.freshnessPath, r); }, /freshness receipt mismatched/],
  ]) await t.test(name, t => { const f = fixture(t); change(f); assert.throws(() => compare({ storyboard: f.source }, f.dir), pattern); });
});

test("legacy jobs without immutable metadata accept only the same storyboard semantics", t => {
  const f = fixture(t, { legacy: true });
  const same = structuredClone(f.source); same.content.exported_at = "volatile timestamp";
  const result = compare({ storyboard: same }, f.dir);
  assert.equal(result.existingStoryboardPath, f.storyboardPath);
  assert.deepEqual(get(f.storyboardPath), f.source);
  const changed = structuredClone(f.source); changed.scenes[0].narration = "changed";
  assert.throws(() => compare({ storyboard: changed }, f.dir), /storyboard changed for an existing job id/);
});

test("unreadable legacy pipeline state is rejected instead of starting a new production", t => {
  const f = fixture(t, { legacy: true });
  writeFileSync(f.statePath, "{bad-json");
  assert.throws(() => compare({ storyboard: f.source }, f.dir));
});

test("the worker checks the incoming fresh snapshot against the immutable source on resume", () => {
  const verifierStart = worker.indexOf('const checked = spawnSync(process.execPath, [verifier, "verify",');
  assert.match(worker.slice(verifierStart, verifierStart + 220), /existingStoryboardPath \|\| storyboardPath/);
});
