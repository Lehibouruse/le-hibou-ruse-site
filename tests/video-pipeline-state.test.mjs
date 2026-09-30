import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectPipeline } from "../scripts/video-pipeline-state.mjs";

function put(root,name,value){
  const path=join(root,name);
  mkdirSync(resolve(path,".."),{recursive:true});
  writeFileSync(path,typeof value==="string"?value:JSON.stringify(value));
}

test("pipeline status surfaces the latest failed stage instead of returning a silent generic gate",()=>{
  const root=mkdtempSync(join(tmpdir(),"hibou-state-error-"));
  try{
    put(root,"pipeline-run.json",{schema:"HIBOU_VIDEO_MASTER_RUN_V1",stages:{
      storyboard:{status:"ERROR",error:"AIRTABLE_TOKEN missing"}
    }});
    const status=inspectPipeline(root);
    assert.equal(status.gate,"PIPELINE_ERROR");
    assert.equal(status.run.last_error_stage,"storyboard");
    assert.match(status.next,/AIRTABLE_TOKEN missing/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("pipeline status uses the effective image plan requests instead of hard-coding three candidates",()=>{
  const root=mkdtempSync(join(tmpdir(),"hibou-state-candidates-"));
  try{
    put(root,"storyboard.json",{scenes:[{scene_id:"S01"}],production:{candidates_per_scene:1}});
    put(root,"voice/contract-audio-ready.json",{ok:true});
    put(root,"voice/contract-mastered.json",{ok:true});
    put(root,"subtitles.ass","[Script Info]\n");
    put(root,"images/image-plan.json",{scene_count:1,candidates_per_scene:1,requests:[
      {candidate_id:"S01-C1",scene_id:"S01"}
    ]});
    put(root,"images/batch-manifest.json",{results:{"S01-C1":{status:"completed"}}});
    const status=inspectPipeline(root);
    assert.equal(status.image_generation.expected_requests,1);
    assert.equal(status.image_generation.completed_requests,1);
    assert.equal(status.image_generation.ready,true);
    assert.equal(status.gate,"IMAGE_TECHNICAL_QC_REQUIRED");
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("video-pipeline-state CLI prints JSON through a portable file URL entrypoint check",()=>{
  const root=mkdtempSync(join(tmpdir(),"hibou-state-cli-"));
  try{
    const result=spawnSync(process.execPath,["scripts/video-pipeline-state.mjs",root],{
      cwd:resolve("."),
      encoding:"utf8"
    });
    assert.equal(result.status,0,result.stderr||result.stdout);
    const parsed=JSON.parse(result.stdout);
    assert.equal(parsed.schema,"HIBOU_PIPELINE_STATE_V3");
    assert.equal(parsed.gate,"EXPORT_REQUIRED");
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("pipeline status stops at final-frame semantic review after a technically valid master",()=>{
  const root=mkdtempSync(join(tmpdir(),"hibou-state-semantic-"));
  try{
    put(root,"storyboard.json",{scenes:[{scene_id:"S01"}]});
    put(root,"voice/contract-audio-ready.json",{ok:true});
    put(root,"voice/contract-mastered.json",{ok:true});
    put(root,"subtitles.ass","[Script Info]\n");
    put(root,"images/image-plan.json",{scene_count:1,requests:[],skipped_full_reuse:["S01"]});
    put(root,"images/batch-manifest.json",{results:{}});
    put(root,"images/image-perceptual-qc.json",{all_scenes_have_candidate:true});
    put(root,"images/selections.json",{S01:{selected:"bg.png"}});
    put(root,"render-ready.json",{ok:true});
    put(root,"master.mp4","video");
    put(root,"master-qc.json",{status:"PASS"});
    put(root,"creative-qc.json",{status:"PASS"});
    put(root,"master-semantic-qc.json",{status:"REJECT"});
    const status=inspectPipeline(root);
    assert.equal(status.gate,"MASTER_SEMANTIC_REVIEW");
    assert.equal(status.artifacts.master_semantic_qc,"REJECT");
  }finally{rmSync(root,{recursive:true,force:true});}
});
