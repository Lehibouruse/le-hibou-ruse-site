import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const voice = readFileSync(
  new URL("../scripts/chatterbox-storyboard-batch.py", import.meta.url),
  "utf8",
);

test("voice runtime surfaces a concise Chatterbox root cause before traceback noise", () => {
  assert.match(voice, /HIBOU_CHATTERBOX_LOAD_ROOT_CAUSE/);
  assert.match(voice, /importlib\.metadata\.version\("chatterbox-tts"\)/);
});

test("voice runtime repairs only known tokenizer corruption once", () => {
  assert.match(voice, /trailing characters\|Tokenizer\\\.from_file\|grapheme_mtl/);
  assert.match(voice, /force_download=True/);
  assert.match(voice, /grapheme_mtl_merged_expanded_v1\.json/);
  assert.match(voice, /HIBOU_CHATTERBOX_TOKENIZER_REPAIR_OK/);
  assert.match(voice, /HIBOU_CHATTERBOX_TOKENIZER_REPAIR_FAILED/);
});

test("voice runtime still fails closed for unrelated model-load failures", () => {
  assert.match(voice, /else:\r?\n\s+fail\(f"Chatterbox model load failed on \{device\}: \{exc\}"\)/);
  assert.doesNotMatch(voice, /device\s*=\s*["']cpu["']/);
});
