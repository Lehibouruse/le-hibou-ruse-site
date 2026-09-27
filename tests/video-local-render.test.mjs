import assert from "node:assert/strict";
import test from "node:test";
import { buildSceneRenderFingerprint, buildSubtitleFontRuntime, renderEncodingPolicy, validateVideoContract } from "../scripts/video-local-render.mjs";

test("un contrat storyboard est refusé explicitement par le renderer", () => {
  const contract = {
    contract_version: "HIBOU_VIDEO_CONTRACT_V1",
    contract_state: "storyboard",
    content: {},
    engine: { width: 1080, height: 1920, fps: 30 },
    scenes: [],
    audio: {},
    music: {},
    subtitles: {},
    qc: {},
    validation: {},
  };
  assert.throws(
    () => validateVideoContract(contract, process.cwd()),
    /storyboard contract is not render-ready/,
  );
});

test("un ancien contrat sans contract_state reste traité comme render_ready", () => {
  const contract = {
    contract_version: "HIBOU_VIDEO_CONTRACT_V1",
    content: {},
    engine: { width: 1080, height: 1920, fps: 30 },
    scenes: [],
    audio: { reference: "missing.wav", sha256: "0".repeat(64) },
    music: {},
    subtitles: {},
    qc: {},
    validation: {},
  };
  assert.throws(() => validateVideoContract(contract, process.cwd()), /audio missing/);
});


test("preview encoding is faster but remains explicitly non-publishable downstream",()=>{
  const policy=renderEncodingPolicy({production:{mode:"preview"},engine:{}});
  assert.deepEqual(policy,{production_mode:"preview",preset:"veryfast",crf:23,preview_only:true});
});

test("final encoding keeps the premium defaults",()=>{
  const policy=renderEncodingPolicy({production:{mode:"final"},engine:{}});
  assert.deepEqual(policy,{production_mode:"final",preset:"medium",crf:18,preview_only:false});
});

test("encoding policy rejects unknown modes",()=>{
  assert.throws(()=>renderEncodingPolicy({production:{mode:"fastest"},engine:{}}),/preview or final/);
});


test("scene render fingerprint changes when encode quality changes",()=>{
  const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",engine:{renderer:"ffmpeg",renderer_version:"v1",width:1080,height:1920,fps:30}};
  const plan={normalized:{background:"x.png"},timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[]}};
  const a=buildSceneRenderFingerprint({contract,plan,assetHashes:["a".repeat(64)],duration:4,preset:"veryfast",crf:23});
  const b=buildSceneRenderFingerprint({contract,plan,assetHashes:["a".repeat(64)],duration:4,preset:"veryfast",crf:18});
  assert.notEqual(a,b);
});


test("windows subtitle runtime is self-contained and points at Windows fonts",()=> {
  const plan=buildSubtitleFontRuntime({
    platform:"win32",
    workDir:"C:\\temp\\hibou-render",
    windowsDir:"C:\\Windows",
  });
  assert.equal(plan.enabled,true);
  assert.match(plan.fonts_dir,/Windows[\\/]Fonts$/);
  assert.match(plan.fontconfig_file,/fontconfig[\\/]fonts\.conf$/);
  assert.match(plan.fontconfig_xml,/<fontconfig>/);
  assert.match(plan.fontconfig_xml,/Windows\/Fonts/);
  assert.equal(plan.env.FONTCONFIG_FILE,plan.fontconfig_file);
  assert.equal(plan.env.FONTCONFIG_PATH,plan.fontconfig_dir);
});

test("non-Windows subtitle runtime leaves system font configuration untouched",()=> {
  const plan=buildSubtitleFontRuntime({
    platform:"linux",
    workDir:"/tmp/hibou-render",
  });
  assert.equal(plan.enabled,false);
  assert.deepEqual(plan.env,{});
  assert.equal(plan.fonts_dir,null);
});
