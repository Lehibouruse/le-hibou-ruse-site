import assert from "node:assert/strict";
import test from "node:test";
import { buildCorpusProposal } from "../scripts/corpus-dashboard-sync.mjs";

test("dashboard proposal separates videos, forensic and active queue counts",()=>{
  const inventory={files:[
    {bucket:"Renard-Finance",path:"Renard-Finance/a.mp4",bytes:1024},
    {bucket:"Renard-Finance",path:"Renard-Finance/info.json",bytes:512},
    {bucket:"Furet",path:"Furet/b.mp4",bytes:2048}
  ]};
  const forensic={"Renard Finance":{forensic:1,transcribed:1,advanced:1,wpm:1},"Écureuil Finance / Le Furet Futé":{forensic:0,transcribed:0,advanced:0,wpm:0}};
  const queue={"Renard Finance":2};
  const p=buildCorpusProposal(inventory,forensic,queue);
  const renard=p.find(x=>x.competitor==="Renard Finance");
  const furet=p.find(x=>x.competitor==="Écureuil Finance / Le Furet Futé");
  assert.equal(renard.fields["Vidéos téléchargées"],1);
  assert.equal(renard.fields["Forensic prêts"],1);
  assert.equal(renard.fields["Transcrites"],1);
  assert.equal(renard.fields["Forensic avancés"],1);
  assert.equal(renard.fields["WPM mesurés"],1);
  assert.equal(renard.fields["URLs en file"],2);
  assert.equal(furet.fields["Vidéos téléchargées"],1);
});

test("dashboard keeps advanced counters at zero when forensic evidence is absent",()=>{
  const inventory={files:[{bucket:"Renard-Finance",path:"Renard-Finance/a.mp4",bytes:1024}]};
  const p=buildCorpusProposal(inventory,{}, {});
  const renard=p.find(x=>x.competitor==="Renard Finance");
  assert.equal(renard.fields["Forensic avancés"],0);
  assert.equal(renard.fields["WPM mesurés"],0);
});
