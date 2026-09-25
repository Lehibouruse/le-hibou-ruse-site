import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetGraph, normalizeAsset, planSceneAssetReuse, resolveAsset } from "../scripts/video-asset-graph.mjs";

const H1="a".repeat(64), H2="b".repeat(64);

test("exact duplicate hashes merge without deleting metadata",()=>{
  const graph=buildAssetGraph([
    {kind:"character_pose",path:"owl-a.png",sha256:H1,tags:["hibou","debout"],transparent:true},
    {kind:"character_pose",path:"owl-copy.png",sha256:H1,tags:["Hibou","Souriant"],transparent:true}
  ]);
  assert.equal(graph.assets.length,1);
  assert.deepEqual(graph.assets[0].tags,["debout","hibou","souriant"]);
  assert.equal(graph.assets[0].aliases.includes("owl-copy.png"),true);
  assert.equal(graph.policy.exact_sha256_duplicates_merged,true);
});

test("near duplicate pHash is review-only and never auto merged",()=>{
  const graph=buildAssetGraph([
    {kind:"object",path:"a.png",sha256:H1,phash:"00000000",tags:["piece"]},
    {kind:"object",path:"b.png",sha256:H2,phash:"00000001",tags:["piece"]}
  ],{nearDuplicateDistance:2});
  assert.equal(graph.assets.length,2);
  assert.equal(graph.near_duplicates.length,1);
  assert.equal(graph.near_duplicates[0].auto_merged,false);
});

test("resolver requires all required tags and ranks optional matches deterministically",()=>{
  const graph=buildAssetGraph([
    {asset_id:"weak",kind:"background",path:"office.png",tags:["bureau"]},
    {asset_id:"best",kind:"background",path:"office-night.png",tags:["bureau","nuit","premium"]}
  ]);
  const found=resolveAsset(graph,{kind:"background",required_tags:["bureau"],optional_tags:["nuit","premium"]});
  assert.equal(found.asset.asset_id,"best");
  assert.equal(found.optional_hits.length,2);
});

test("scene plan reuses known layers and generates only missing slots",()=>{
  const graph=buildAssetGraph([
    {asset_id:"owl",kind:"character_pose",path:"owl.png",tags:["hibou","explication"],transparent:true},
    {asset_id:"coin",kind:"object",path:"coin.png",tags:["piece","or"],transparent:true}
  ]);
  const plan=planSceneAssetReuse({
    scene_id:"S01",
    asset_requirements:[
      {slot:"character_pose",kind:"character_pose",required_tags:["hibou"],optional_tags:["explication"]},
      {slot:"object_1",kind:"object",required_tags:["piece"]},
      {slot:"background",kind:"background",required_tags:["bureau"]}
    ]
  },graph);
  assert.equal(plan.reusable_count,2);
  assert.equal(plan.generation_count,1);
  assert.equal(plan.slots.find(x=>x.slot==="background").action,"generate");
  assert.equal(plan.generation_only_for_missing_slots,true);
});

test("normalization rejects malformed hashes",()=>{
  assert.throws(()=>normalizeAsset({kind:"object",path:"x.png",sha256:"abc"}),/64 hex/);
});
