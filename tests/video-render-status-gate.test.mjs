import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { completedVideoResultAllowed } from "../scripts/video-render-status-gate.mjs";

test("only a strict prompt contract PASS can complete a video queue job",()=>{
  const valid={schema:"HIBOU_VIDEO_RENDER_RESULT_V2",prompt_contract_pass:true,publication_authorized:false};
  assert.equal(completedVideoResultAllowed(valid),true);
  assert.equal(completedVideoResultAllowed({...valid,prompt_contract_pass:false}),false);
  assert.equal(completedVideoResultAllowed({...valid,prompt_contract_pass:null}),false);
  assert.equal(completedVideoResultAllowed({...valid,publication_authorized:true}),false);
  assert.equal(completedVideoResultAllowed({...valid,schema:"HIBOU_VIDEO_RENDER_REVIEW_PENDING_V1"}),false);
  assert.equal(completedVideoResultAllowed(null),false);
  const route=readFileSync(new URL("../app/api/local-worker-queue/route.js",import.meta.url),"utf8");
  assert.match(route,/status === "Completed" && !completedVideoResultAllowed\(body\.result\)/);
  const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
  assert.match(worker,/if \(!promptContractComplete\) \{[\s\S]*?reportVideoProgress\(job, "Paused"/);
});
