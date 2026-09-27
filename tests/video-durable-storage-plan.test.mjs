import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDurableStoragePlan,
  DURABLE_STORAGE_PLAN_SCHEMA,
} from "../scripts/video-durable-storage-plan.mjs";

function registry(){
  return {
    schema:"HIBOU_VIDEO_ARTIFACT_REGISTRY_V2",
    production_mode:"final",
    preview_only:false,
    entries:[
      {
        kind:"master",
        name:"master.mp4",
        path:"/tmp/master.mp4",
        sha256:"a".repeat(64),
        size_bytes:1000,
        durable_url:null,
        metadata:null
      },
      {
        kind:"selected_image",
        name:"scene-1.png",
        path:"/tmp/scene-1.png",
        sha256:"b".repeat(64),
        size_bytes:200,
        durable_url:null,
        metadata:{scene_id:"S01",human_selected:true}
      },
      {
        kind:"candidate_review_html",
        name:"candidate-review.html",
        path:"/tmp/candidate-review.html",
        sha256:"c".repeat(64),
        size_bytes:50,
        durable_url:"s3://existing/review"
      }
    ]
  };
}

test("storage plan is content-addressed and performs no transfer",()=>{
  const plan=buildDurableStoragePlan(registry(),{
    content_id:"recCONTENT1234567",
    job_id:"recJOB1234567890"
  });
  assert.equal(plan.schema,DURABLE_STORAGE_PLAN_SCHEMA);
  assert.equal(plan.entry_count,3);
  assert.equal(plan.total_size_bytes,1250);
  assert.equal(plan.execution.upload_performed,false);
  assert.equal(plan.execution.files_moved,false);
  assert.equal(plan.execution.files_deleted,false);
  assert.equal(plan.execution.network_required,false);
  assert.equal(plan.publication_authorized,false);
  assert.match(plan.entries[0].target_key,/hibou-video\/recCONTENT1234567\/recJOB1234567890\/a{64}\/master\.mp4/);
});

test("master and selected images are critical retention artifacts",()=>{
  const plan=buildDurableStoragePlan(registry(),{});
  const master=plan.entries.find(x=>x.kind==="master");
  const image=plan.entries.find(x=>x.kind==="selected_image");
  assert.equal(master.retention_class,"critical");
  assert.equal(image.retention_class,"critical");
  assert.equal(image.metadata.scene_id,"S01");
  assert.equal(image.metadata.human_selected,true);
});

test("existing durable URL is verified rather than copied",()=>{
  const plan=buildDurableStoragePlan(registry(),{});
  const existing=plan.entries.find(x=>x.kind==="candidate_review_html");
  assert.equal(existing.action,"VERIFY_DURABLE");
  assert.equal(existing.upload_performed,false);
});

test("invalid artifact hash is rejected",()=>{
  const bad=registry();
  bad.entries[0].sha256="bad";
  assert.throws(()=>buildDurableStoragePlan(bad,{}),/sha256 missing or invalid/);
});

test("wrong registry schema is rejected",()=>{
  assert.throws(
    ()=>buildDurableStoragePlan({schema:"OTHER"},{}),
    /HIBOU_VIDEO_ARTIFACT_REGISTRY_V2 required/
  );
});
