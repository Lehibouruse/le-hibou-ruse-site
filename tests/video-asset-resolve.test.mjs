import assert from "node:assert/strict";
import test from "node:test";
import { applyAssetResolution } from "../scripts/video-asset-resolve.mjs";

test("asset resolution composes a full reusable scene and exposes no generation slots",()=>{
  const contract={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    contract_state:"storyboard",
    scenes:[{
      scene_id:"S01",
      asset_requirements:[
        {slot:"background",kind:"background",required_tags:["bureau"]},
        {slot:"character_pose",kind:"character_pose",required_tags:["hibou","explication"]},
        {slot:"object_1",kind:"object",required_tags:["piece"]}
      ]
    }]
  };
  const graph={schema:"HIBOU_ASSET_GRAPH_V1",assets:[
    {asset_id:"bg",kind:"background",path:"assets/bg.png",tags:["bureau"],reusable:true},
    {asset_id:"owl",kind:"character_pose",path:"assets/owl.png",tags:["hibou","explication"],reusable:true},
    {asset_id:"coin",kind:"object",path:"assets/coin.png",tags:["piece"],reusable:true}
  ]};
  const out=applyAssetResolution(contract,graph,{graphPath:"/tmp/graph/asset-graph.json"});
  assert.equal(out.scenes[0].asset_resolution.status,"FULL_REUSE");
  assert.match(out.scenes[0].composition.background,/assets\/bg\.png$/);
  assert.match(out.scenes[0].composition.character_pose.path,/assets\/owl\.png$/);
  assert.equal(out.scenes[0].composition.object_layers.length,1);
  assert.equal(out.asset_resolution.generation_slots.length,0);
  assert.deepEqual(out.asset_resolution.full_reuse_scenes,["S01"]);
});

test("partial matches remain explicit and do not override full-scene fallback",()=>{
  const contract={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    contract_state:"storyboard",
    scenes:[{
      scene_id:"S02",
      image:{selected:null},
      asset_requirements:[
        {slot:"background",kind:"background",required_tags:["bureau"]},
        {slot:"character_pose",kind:"character_pose",required_tags:["hibou"]}
      ]
    }]
  };
  const graph={schema:"HIBOU_ASSET_GRAPH_V1",assets:[
    {asset_id:"bg",kind:"background",path:"bg.png",tags:["bureau"],reusable:true}
  ]};
  const out=applyAssetResolution(contract,graph,{graphPath:"/tmp/asset-graph.json"});
  assert.equal(out.scenes[0].asset_resolution.status,"PARTIAL_OR_GENERATE");
  assert.equal(out.scenes[0].composition,undefined);
  assert.equal(out.asset_resolution.generation_slots.length,1);
  assert.equal(out.asset_resolution.generation_slots[0].slot,"character_pose");
});
