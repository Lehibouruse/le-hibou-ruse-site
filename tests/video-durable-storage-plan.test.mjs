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
  assert.equal(plan.transfer_summary.reference_count,3);
  assert.equal(plan.transfer_summary.unique_object_count,3);
  assert.equal(plan.transfer_summary.duplicate_reference_count,0);
  assert.equal(plan.transfer_summary.unique_total_size_bytes,1250);
  assert.match(plan.entries[0].object_key,/hibou-video\/objects\/sha256\/aa\/a{64}$/);
  assert.match(
    plan.entries[0].run_reference_key,
    /hibou-video\/runs\/recCONTENT1234567\/recJOB1234567890\/master\/master\.mp4$/,
  );
  assert.equal(plan.entries[0].verification.verify_after_transfer,true);
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


test("duplicate hashes collapse to one immutable object while keeping run references",()=>{
  const input=registry();
  input.entries.push({
    kind:"qc",
    name:"master-copy.json",
    path:"/tmp/master-copy.json",
    sha256:"a".repeat(64),
    size_bytes:1000,
    durable_url:null,
    metadata:{duplicate_reference:true}
  });
  const plan=buildDurableStoragePlan(input,{
    content_id:"recCONTENT1234567",
    job_id:"recJOB1234567890"
  });
  assert.equal(plan.entry_count,4);
  assert.equal(plan.objects.length,3);
  assert.equal(plan.transfer_summary.unique_object_count,3);
  assert.equal(plan.transfer_summary.duplicate_reference_count,1);
  assert.equal(plan.transfer_summary.referenced_total_size_bytes,2250);
  assert.equal(plan.transfer_summary.unique_total_size_bytes,1250);
  const object=plan.objects.find(x=>x.sha256==="a".repeat(64));
  assert.equal(object.reference_count,2);
  assert.equal(object.retention_class,"critical");
  assert.equal(object.copy_priority,0);
  assert.equal(object.preferred_action,"COPY_REQUIRED");
});

test("existing durable location is a verification candidate, never trusted by presence alone",()=>{
  const plan=buildDurableStoragePlan(registry(),{});
  const object=plan.objects.find(x=>x.sha256==="c".repeat(64));
  assert.equal(object.preferred_action,"VERIFY_EXISTING_ELSE_COPY");
  assert.deepEqual(object.candidate_durable_urls,["s3://existing/review"]);
  assert.equal(object.verify_sha256_required,true);
  assert.equal(object.verify_size_required,true);
  assert.equal(plan.transfer_summary.verify_existing_object_count,1);
});

test("local paths cannot masquerade as durable URLs",()=>{
  for(const durable_url of [
    "C:\\Users\\phili\\video.mp4",
    "/tmp/video.mp4",
    "file:///tmp/video.mp4"
  ]){
    const bad=registry();
    bad.entries[0].durable_url=durable_url;
    assert.throws(
      ()=>buildDurableStoragePlan(bad,{}),
      /durable_url must be a non-local absolute URI/,
    );
  }
});

test("same hash with conflicting size metadata is rejected",()=>{
  const bad=registry();
  bad.entries.push({
    kind:"qc",
    name:"conflict.json",
    path:"/tmp/conflict.json",
    sha256:"a".repeat(64),
    size_bytes:999,
    durable_url:null
  });
  assert.throws(
    ()=>buildDurableStoragePlan(bad,{}),
    /same sha256 cannot declare conflicting size_bytes/,
  );
});

test("immutable objects are sorted critical then high then standard",()=>{
  const input=registry();
  input.entries.push({
    kind:"review_diff",
    name:"review-diff.json",
    path:"/tmp/review-diff.json",
    sha256:"d".repeat(64),
    size_bytes:60,
    durable_url:null
  });
  input.entries.push({
    kind:"candidate_review_html",
    name:"other.html",
    path:"/tmp/other.html",
    sha256:"e".repeat(64),
    size_bytes:70,
    durable_url:null
  });
  const plan=buildDurableStoragePlan(input,{});
  const priorities=plan.objects.map(x=>x.copy_priority);
  assert.deepEqual(priorities,[0,0,1,2,2]);
  assert.equal(plan.transfer_summary.critical_unique_object_count,2);
});
