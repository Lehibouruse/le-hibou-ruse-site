import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const batch = readFileSync(
  new URL("../scripts/chatterbox-storyboard-batch.py", import.meta.url),
  "utf8",
);

test("Chatterbox cache requires a plausible stored voice duration", () => {
  assert.match(batch, /def duration_bounds\(/);
  assert.match(batch, /def duration_is_plausible\(/);
  assert.match(batch, /voice_duration_s/);
  assert.match(batch, /load_cache\(manifest_path, scene_path, fingerprint, bounds\)/);
  assert.match(batch, /if not duration_is_plausible\(data\.get\("voice_duration_s"\), bounds\)/);
});

test("implausible generated duration gets exactly one deterministic retry path", () => {
  assert.match(batch, /HIBOU_VOICE_DURATION_RETRY/);
  assert.match(batch, /duration_retry_seed_offset = 100000/);
  assert.match(batch, /retry_item\["native"\]\["seed"\] = int\(item\["native"\]\["seed"\]\) \+ duration_retry_seed_offset/);
  assert.match(batch, /voice duration remained implausible after one deterministic retry/);
  assert.doesNotMatch(batch, /while .*duration/i);
});

test("duration retry evidence is persisted in cache and scene metadata", () => {
  assert.match(batch, /"duration_retry_applied": duration_retry_applied/);
  assert.match(batch, /"duration_retry_seed_offset": duration_retry_seed_offset/);
  assert.match(batch, /"duration_bounds": item\["duration_bounds"\]/);
});
