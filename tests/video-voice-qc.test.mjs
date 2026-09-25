import assert from "node:assert/strict";
import test from "node:test";
import { compareVoiceContract, normalizeWords, wordErrorRate } from "../scripts/video-voice-qc.mjs";

test("normalization ignores accents, punctuation and apostrophes",()=>{
  assert.deepEqual(normalizeWords("L’Hibou économise 1 000 € !"),["l","hibou","economise","1","000"]);
});

test("word error rate is zero for normalized equivalent text",()=>{
  assert.equal(wordErrorRate("C'est l'été.","C est l ete"),0);
});

const contract={
  contract_version:"HIBOU_VIDEO_CONTRACT_V1",
  scenes:[
    {scene_id:"S01",narration_text:"Le Hibou garde ses actions.",narration_exact:{start_s:0,end_s:2}},
    {scene_id:"S02",narration_text:"Il emprunte contre son portefeuille.",narration_exact:{start_s:2,end_s:5}},
  ]
};

test("voice QC passes matching transcript and keeps publication locked",()=>{
  const transcript={
    schema:"HIBOU_FORENSIC_TRANSCRIPT_V1",status:"ok",language:"fr",language_probability:.99,
    segments:[
      {start:0,end:1.9,text:"Le hibou garde ses actions."},
      {start:2.05,end:4.8,text:"Il emprunte contre son portefeuille."}
    ],
    text:"Le hibou garde ses actions. Il emprunte contre son portefeuille."
  };
  const r=compareVoiceContract(contract,transcript);
  assert.equal(r.status,"PASS");
  assert.equal(r.overall_wer,0);
  assert.equal(r.counts.review,0);
  assert.equal(r.policy.publication_authorized,false);
});

test("voice QC isolates the scene needing review",()=>{
  const transcript={
    schema:"HIBOU_FORENSIC_TRANSCRIPT_V1",status:"ok",language:"fr",language_probability:.95,
    segments:[
      {start:0,end:1.9,text:"Le hibou garde ses actions."},
      {start:2.05,end:4.8,text:"Le hibou vend sa maison demain."}
    ],
    text:"Le hibou garde ses actions. Le hibou vend sa maison demain."
  };
  const r=compareVoiceContract(contract,transcript,{maxOverallWer:.2,maxSceneWer:.25});
  assert.equal(r.status,"REVIEW");
  assert.equal(r.scenes[0].status,"PASS");
  assert.equal(r.scenes[1].status,"REVIEW");
  assert.ok(r.recommendations.some(x=>x.scope==="S02"));
});

test("wrong detected language forces review",()=>{
  const transcript={
    schema:"HIBOU_FORENSIC_TRANSCRIPT_V1",status:"ok",language:"en",language_probability:.99,
    segments:[
      {start:0,end:2,text:"Le hibou garde ses actions."},
      {start:2,end:5,text:"Il emprunte contre son portefeuille."}
    ],
    text:"Le hibou garde ses actions. Il emprunte contre son portefeuille."
  };
  assert.equal(compareVoiceContract(contract,transcript).status,"REVIEW");
});
