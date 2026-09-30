import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const adapter=readFileSync(new URL("../scripts/video-local-adapters.mjs",import.meta.url),"utf8");

test("ComfyUI adapter tags prompts with the queue job-scoped client id",()=>{
  assert.match(adapter,/HIBOU_VIDEO_CLIENT_ID/);
  assert.match(adapter,/client_id:/);
  assert.match(adapter,/hibou-local-worker/);
});
