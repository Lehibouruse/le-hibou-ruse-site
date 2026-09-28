import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessAssetGraphReadiness } from "../scripts/video-asset-readiness.mjs";

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"hibou-asset-ready-"));
  const file=join(dir,"office.png");
  writeFileSync(file,Buffer.from("validated-asset"));
  const sha=createHash("sha256").update(Buffer.from("validated-asset")).digest("hex");
  const contract={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    scenes:[
      {
        scene_id:"S01",
        visual_group:"office-a",
        asset_requirements:[
          {slot:"background",kind:"background",required_tags:["office"]}
        ]
      }
    ]
  };
  const graph={
    schema:"HIBOU_ASSET_GRAPH_V1",
    assets:[
      {
        asset_id:"office",
        kind:"background",
        path:"office.png",
        sha256:sha,
        tags:["office"],
        reusable:true,
        quality_status:"validated",
        provenance:{license:"commercial-compatible",source:"local"}
      }
    ]
  };
  const graphPath=join(dir,"asset-graph.json");
  writeFileSync(graphPath,JSON.stringify(graph));
  return {dir,file,graphPath,contract,graph};
}

test("asset readiness accepts a validated hash-bound reusable asset",()=>{
  const x=fixture();
  const report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.ready_for_activation,true);
  assert.equal(report.reusable_slot_count,1);
  assert.equal(report.generation_slot_count,0);
  assert.equal(report.asset_checks[0].sha256_match,true);
});

test("asset readiness fails closed on hash drift or missing files",()=>{
  const x=fixture();
  x.graph.assets[0].sha256="0".repeat(64);
  let report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.ready_for_activation,false);
  assert(report.blocking_codes.includes("reusable_asset_sha256_mismatch"));

  x.graph.assets[0].path="missing.png";
  report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert(report.blocking_codes.includes("reusable_asset_missing"));
});

test("candidate assets cannot silently become production-reusable",()=>{
  const x=fixture();
  x.graph.assets[0].quality_status="candidate";
  const report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.ready_for_activation,false);
  assert(report.blocking_codes.includes("reusable_asset_not_validated"));
});

test("missing graph coverage may fall back to generation but missing requirements do not count as activation",()=>{
  const x=fixture();
  x.contract.scenes[0].asset_requirements=[
    {slot:"object",kind:"object",required_tags:["coin"]}
  ];
  let report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.ready_for_activation,true);
  assert.equal(report.reusable_slot_count,0);
  assert.equal(report.generation_slot_count,1);
  assert(report.warnings.some(w=>w.code==="asset_graph_matches_no_contract_slots"));

  x.contract.scenes[0].asset_requirements=[];
  report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.ready_for_activation,false);
  assert(report.blocking_codes.includes("contract_has_no_asset_requirements"));
});

test("asset doctor is read-only and never authorizes publication",()=>{
  const x=fixture();
  const report=assessAssetGraphReadiness(x.contract,x.graph,{graphPath:x.graphPath});
  assert.equal(report.policy.read_only,true);
  assert.equal(report.policy.filesystem_mutation_performed,false);
  assert.equal(report.policy.gpu_execution_performed,false);
  assert.equal(report.policy.publication_authorized,false);
});
