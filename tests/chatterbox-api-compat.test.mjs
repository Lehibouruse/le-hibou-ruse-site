import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const batch = readFileSync(
  new URL("../scripts/chatterbox-storyboard-batch.py", import.meta.url),
  "utf8",
);
const simple = readFileSync(
  new URL("../scripts/chatterbox-local.py", import.meta.url),
  "utf8",
);

for (const [name, source] of [["batch", batch], ["simple", simple]]) {
  test(`${name} Chatterbox wrapper inspects from_pretrained before using t3_model`, () => {
    assert.match(source, /inspect\.signature\(ChatterboxMultilingualTTS\.from_pretrained\)/);
    assert.match(source, /if "t3_model" in signature\.parameters/);
    assert.match(source, /load_kwargs = \{"device": device\}/);
    assert.match(source, /from_pretrained\(\*\*load_kwargs\)/);
  });
}

test("batch records whether the requested model variant was natively applied", () => {
  assert.match(batch, /"model_variant_native": None/);
  assert.match(batch, /item\["native"\]\["model_variant_native"\]/);
});
