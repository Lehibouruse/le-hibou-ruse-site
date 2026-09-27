import assert from "node:assert/strict";
import test from "node:test";
import { renderEncodingPolicy, validateVideoContract } from "../scripts/video-local-render.mjs";

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
