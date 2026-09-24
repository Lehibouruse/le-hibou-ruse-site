import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewAss, validateStoryboardPreview } from "../scripts/video-storyboard-preview.mjs";

const sample={
  contract_version:"HIBOU_VIDEO_CONTRACT_V1",
  method_version:"VIDEO_METHOD_V3",
  title:"Test",
  exact_narration:Array.from({length:15},(_,i)=>`S${i+1}`).join(" "),
  planned_duration_s:22.5,
  scenes:Array.from({length:15},(_,i)=>({order:i+1,planned_duration_s:1.5,narration:`S${i+1}`}))
};

test("storyboard preview validates an exact V3 timeline",()=>{
  assert.deepEqual(validateStoryboardPreview(sample),{total:22.5,sceneCount:15});
});

test("preview is explicitly marked non-publishable in its overlay",()=>{
  const ass=buildPreviewAss(sample);
  assert.match(ass,/PREVIEW TECHNIQUE — NON PUBLIABLE/);
  assert.match(ass,/SCÈNE 15 \/ 15/);
});

test("preview rejects narration drift",()=>{
  assert.throws(()=>validateStoryboardPreview({...sample,exact_narration:"wrong"}),/does not reconstruct/);
});
