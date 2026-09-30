import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { materializeSpecificActionTimelines, verifySpecificMontageRenderReceipt } from "../scripts/video-master.mjs";
import { buildSceneCompositePlan } from "../scripts/video-scene-compositor.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");

test("montage verifier accepts renderer filter hash and rejects a changed receipt",async()=>{
  const root=mkdtempSync(join(tmpdir(),"hibou-montage-receipt-"));
  const board={content:{content_id:"rec8lgQT8jXreflmt"},scenes:[{
    scene_id:"S05",order:5,planned_duration_s:9,
    visual_idea:"[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 5 — marge bancaire chaque année."
  }]};
  materializeSpecificActionTimelines(board);
  const scene={...board.scenes[0],composition:{background:"bg.png",camera_transform:{zoom_percent:2.5,anchor:"center"}}};
  const plan=buildSceneCompositePlan(scene,{duration:9,width:1080,height:1920,fps:30});
  const master=resolve(root,"master.mp4"),clip=resolve(root,"scene.mp4");
  writeFileSync(master,"synthetic master");
  writeFileSync(clip,"synthetic scene clip");
  const receipt={schema:"HIBOU_SPECIFIC_MONTAGE_RENDER_EXECUTION_V1",master_sha256:sha(readFileSync(master)),scenes:[{
    scene_id:"S05",source_visual_sha256:scene.timeline.specific_montage.source_visual_sha256,
    clip_path:clip,clip_sha256:sha(readFileSync(clip)),
    filter_complex_sha256:sha(JSON.stringify(plan.filter_complex)),
    diagram_events:plan.timeline.events.filter(event=>event.type==="diagram").map(event=>({
      id:event.id,start_s:event.start_s,end_s:event.end_s,
      node_ids:event.diagram.nodes.map(node=>node.id),action:event.action
    }))
  }]};
  writeFileSync(master+".manifest.json",JSON.stringify({engine:{width:1080,height:1920,fps:30},scenes:[scene]}));
  writeFileSync(master+".montage-execution.json",JSON.stringify(receipt));
  const valid=await verifySpecificMontageRenderReceipt({root,storyboard:board,
    compositorPath:resolve("scripts/video-scene-compositor.mjs")});
  assert.equal(valid.render_execution_pass,true);
  receipt.scenes[0].filter_complex_sha256="0".repeat(64);
  writeFileSync(master+".montage-execution.json",JSON.stringify(receipt));
  await assert.rejects(verifySpecificMontageRenderReceipt({root,storyboard:board,
    compositorPath:resolve("scripts/video-scene-compositor.mjs")}),/compositor execution mismatch/);
});
