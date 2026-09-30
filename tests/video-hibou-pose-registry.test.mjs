import assert from "node:assert/strict";
import test from "node:test";
import { applyPoseRegistryToContract, applyPoseToScene, resolvePose, validatePoseRegistry } from "../scripts/video-hibou-pose-registry.mjs";

const registry={
 schema:"HIBOU_POSE_REGISTRY_V1",
 poses:[
  {id:"neutral",category:"neutral",status:"ready",asset_ref:"poses/neutral.webp",default_width:430,tags:["calm"]},
  {id:"pointe",category:"pointe",status:"ready",asset_ref:"poses/pointe.webp",default_width:440,tags:["explique","chiffre"]},
  {id:"contrat",category:"contrat",status:"planned",asset_ref:null,tags:["document"]}
 ]
};

test("pose registry validates and selects reusable ready assets without generation",()=>{
 validatePoseRegistry(registry);
 const result=resolvePose(registry,{category:"pointe",tags:["chiffre"]});
 assert.equal(result.found,true);
 assert.equal(result.pose.asset_ref,"poses/pointe.webp");
 assert.equal(result.generation_requested,false);
});

test("planned poses do not trigger generation during lookup",()=>{
 const result=resolvePose(registry,"contrat");
 assert.equal(result.found,false);
 assert.equal(result.reason,"no_ready_pose");
 assert.equal(result.generation_requested,false);
});

test("pose can be applied statically or as an intra-scene timed event",()=>{
 const pose=resolvePose(registry,"pointe").pose;
 const staticScene=applyPoseToScene({scene_id:"S01"},pose);
 assert.equal(staticScene.composition.character_pose.path,"poses/pointe.webp");
 const timed=applyPoseToScene({scene_id:"S02"},pose,{timelineWindow:{start_s:2,end_s:5}});
 assert.equal(timed.timeline.events[0].type,"pose");
 assert.equal(timed.timeline.events[0].start_s,2);
});

test("canonical fallback is smaller and alternates side placement to avoid repetitive center blocking",()=>{
 const contract={
   contract_version:"HIBOU_VIDEO_CONTRACT_V1",
   creative:{
     reference_mode:"deterministic_character_overlay",
     reference_image_local:"C:/tmp/hibou.webp",
     reference_image_sha256:"abc"
   },
   scenes:[
     {scene_id:"S01",order:1,pose_request:"missing",framing:{hibou:true}},
     {scene_id:"S02",order:2,pose_request:"missing",framing:{hibou:true}}
   ]
 };
 const out=applyPoseRegistryToContract(contract,registry,{registryPath:"/tmp/poses/registry.json"});
 assert.equal(out.scenes[0].composition.character_pose.width,300);
 assert.equal(out.scenes[0].composition.character_pose.anchor,"bottom-left");
 assert.equal(out.scenes[1].composition.character_pose.anchor,"bottom-right");
 assert.equal(out.scenes[0].pose_registry_resolution.status,"CANONICAL_FALLBACK");
});

test("contract application reuses only ready poses and never generates planned ones",()=>{
 const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[
   {scene_id:"S01",pose_request:"pointe"},
   {scene_id:"S02",pose_request:"contrat"}
 ]};
 const out=applyPoseRegistryToContract(contract,registry,{registryPath:"/tmp/poses/registry.json"});
 assert.equal(out.pose_registry_application.applied_scenes,1);
 assert.equal(out.pose_registry_application.unresolved_scenes,1);
 assert.equal(out.pose_registry_application.generation_requested,false);
 assert.match(out.scenes[0].composition.character_pose.path,/poses[\\/]pointe\.webp$/);
 assert.equal(out.scenes[1].pose_registry_resolution.status,"UNRESOLVED");
});
