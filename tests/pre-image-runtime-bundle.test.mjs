import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

const sources = [
  "video-audio-master.mjs",
  "video-attach-mastered-audio.mjs",
  "video-subtitles.mjs",
  "video-attach-subtitles.mjs",
  "video-style-apply.mjs",
  "video-asset-resolve.mjs",
  "video-asset-graph.mjs",
].map((name)=>readFileSync(new URL("../scripts/"+name, import.meta.url),"utf8"));

test("video-master downloads pre-image scripts from immutable runtime commit",()=>{
  assert.match(master,/PRE_IMAGE_RUNTIME_FILES/);
  assert.match(master,/LeHibou","pre-image-runtime",normalized/);
  assert.match(master,/raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/\$\{normalized\}\/scripts\/\$\{name\}/);
  assert.match(master,/preRuntime\.audioMaster/);
  assert.match(master,/preRuntime\.attachAudio/);
  assert.match(master,/preRuntime\.subtitles/);
  assert.match(master,/preRuntime\.attachSubtitles/);
  assert.match(master,/preRuntime\.style/);
  assert.match(master,/preRuntime\.assetResolve/);
});

test("pre-image entrypoints are portable on Windows",()=>{
  for(const source of sources){
    assert.match(source,/pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
    assert.doesNotMatch(source,/file:\/\/\$\{process\.argv\[1\]\}/);
  }
});

test("video-master no longer calls local pre-image scripts in queue path",()=>{
  assert.doesNotMatch(master,/resolve\("scripts\/video-audio-master\.mjs"\),rawVoice/);
  assert.doesNotMatch(master,/resolve\("scripts\/video-attach-mastered-audio\.mjs"\),voiceReady/);
  assert.doesNotMatch(master,/resolve\("scripts\/video-subtitles\.mjs"\),masteredContract/);
  assert.doesNotMatch(master,/resolve\("scripts\/video-attach-subtitles\.mjs"\),masteredContract/);
  assert.doesNotMatch(master,/resolve\("scripts\/video-style-apply\.mjs"\),captioned/);
  assert.doesNotMatch(master,/resolve\("scripts\/video-asset-resolve\.mjs"\),styled/);
});
