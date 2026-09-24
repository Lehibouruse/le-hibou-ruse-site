import assert from "node:assert/strict";
import test from "node:test";
import { discoverBinding } from "../scripts/video-comfyui-binding-discover.mjs";

test("discovers common ComfyUI text, seed and output nodes",()=>{
  const wf={
    "6":{class_type:"CLIPTextEncode",inputs:{text:"hello",clip:["1",0]}},
    "25":{class_type:"RandomNoise",inputs:{noise_seed:123}},
    "5":{class_type:"EmptyLatentImage",inputs:{width:1024,height:1024,batch_size:1}},
    "9":{class_type:"SaveImage",inputs:{images:["8",0],filename_prefix:"x"}},
    "10":{class_type:"PreviewImage",inputs:{images:["8",0]}}
  };
  const r=discoverBinding(wf);
  assert.equal(r.status,"CANDIDATE_REQUIRES_HUMAN_CONFIRMATION");
  assert.deepEqual(r.prompt.node_id,"6");
  assert.deepEqual(r.prompt.input,"text");
  assert.deepEqual(r.seed.node_id,"25");
  assert.deepEqual(r.seed.input,"noise_seed");
  assert.equal(r.size.node_id,"5");
  assert.equal(r.size.width_input,"width");
  assert.equal(r.size.height_input,"height");
  assert.equal(r.output_node_ids[0],"9");
  assert.equal(r.human_confirmation_required,true);
});
test("returns incomplete instead of inventing missing nodes",()=>{
  const r=discoverBinding({"1":{class_type:"LoadImage",inputs:{image:"x.png"}}});
  assert.equal(r.status,"INCOMPLETE");
  assert.equal(r.prompt,null);
  assert.equal(r.seed,null);
});
