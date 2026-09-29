import assert from "node:assert/strict";
import test from "node:test";
import { buildAss, splitSubtitleGroups } from "../scripts/video-subtitles.mjs";

function contract(screenText,timeline=null){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    creative:{style_lock:"SOUS-TITRES : courts groupes de mots, blancs gras, contour sombre."},
    scenes:[{
      scene_id:"S01",
      narration_exact:{mode:"audio_reference",start_s:0,end_s:6},
      narration_text:"Texte narration.",
      screen_text:screenText,
      ...(timeline?{timeline}:{}),
    }]
  };
}

test("slash-separated screen text becomes successive attention beats",()=>{
  const ass=buildAss(contract("A / B / C"));
  const screen=ass.split("\n").filter(line=>line.includes(",ScreenText,"));
  assert.equal(screen.length,3);
  assert.match(screen[0],/0:00:00\.00,0:00:02\.00/);
  assert.match(screen[1],/0:00:02\.00,0:00:04\.00/);
  assert.match(screen[2],/0:00:04\.00,0:00:06\.00/);
  assert.match(screen[0],/,A$/);
  assert.match(screen[1],/,B$/);
  assert.match(screen[2],/,C$/);
});

test("structured timeline text suppresses fallback whole-scene screen text",()=>{
  const ass=buildAss(contract("FALLBACK / TEXT",{
    schema:"HIBOU_SCENE_TIMELINE_V1",
    events:[{type:"callout",start_s:1,end_s:2,text:"STRUCTURED"}]
  }));
  const screen=ass.split("\n").filter(line=>line.includes(",ScreenText,"));
  assert.equal(screen.length,0);
  assert.doesNotMatch(ass,/FALLBACK/);
  assert.match(ass,/Texte narration\./);
});


test("narration subtitles are split into short mobile-safe groups",()=>{
  const groups=splitSubtitleGroups(
    "Sauf que la banque te finance au taux de marché plus sa marge et tu repayes cette marge chaque année.",
    {maxWords:6}
  );
  assert.ok(groups.length>=3);
  assert.ok(groups.every(group=>group.split(/\s+/u).length<=6));
  assert.equal(groups.join(" "),"Sauf que la banque te finance au taux de marché plus sa marge et tu repayes cette marge chaque année.");
});

test("ASS output no longer keeps a long narration scene in one subtitle event",()=>{
  const c=contract("");
  c.scenes[0].narration_text="Tu as cent mille euros investis en Bourse et tu veux du cash sans vendre tes actifs.";
  const ass=buildAss(c);
  const narration=ass.split("\n").filter(line=>line.includes(",Narration,"));
  assert.ok(narration.length>=3);
  assert.ok(narration.every(line=>line.split(",,").at(-1).split(/\s+/u).length<=6));
});
