import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promoteStoryboard } from "../scripts/video-storyboard-promote.mjs";

const hash=b=>createHash("sha256").update(b).digest("hex");

test("promotion copies selected media and keeps publication locked",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-"));
  const source=resolve(root,"source"); const picks=resolve(root,"picks"); const out=resolve(root,"out");
  mkdirSync(source,{recursive:true}); mkdirSync(picks,{recursive:true}); mkdirSync(out,{recursive:true});
  const audio=Buffer.from("fake-audio-for-contract-test"); writeFileSync(resolve(source,"voice-master.wav"),audio);
  const image=Buffer.from("fake-image-for-contract-test"); writeFileSync(resolve(picks,"s1.png"),image);
  const audioHash=hash(audio);
  writeFileSync(resolve(source,"contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"p",method_version:"m"},
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{scene_id:"s1",order:1,narration_exact:{mode:"audio_reference",source_audio:"voice-master.wav",start_s:0,end_s:1,sha256:audioHash},visual_idea:"x",screen_text:"x",planned_duration_s:1,image:{candidates:[],selected:null,selection_reason:null},breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}}],
    audio:{state:"ready",reference:"voice-master.wav",sha256:audioHash},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(picks,"selections.json"),JSON.stringify({s1:{selected:"s1.png",candidates:["s1.png"],selection_reason:"QC pass"}}));
  const result=promoteStoryboard(resolve(source,"contract.json"),resolve(picks,"selections.json"),resolve(out,"render-ready.json"));
  assert.equal(result.scene_count,1);
  const promoted=JSON.parse(readFileSync(resolve(out,"render-ready.json"),"utf8"));
  assert.equal(promoted.contract_state,"render_ready");
  assert.equal(promoted.validation.publication_authorized,false);
  assert.match(promoted.audio.reference,/^assets\/audio\//);
  assert.match(promoted.scenes[0].image.selected,/^assets\/images\//);
  assert.equal(promoted.scenes[0].image.selected_sha256,hash(image));
});

test("promotion refuses missing scene selection",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-missing-"));
  mkdirSync(resolve(root,"source"),{recursive:true}); mkdirSync(resolve(root,"picks"),{recursive:true});
  const audio=Buffer.from("audio"); writeFileSync(resolve(root,"source","voice.wav"),audio);
  const h=hash(audio);
  writeFileSync(resolve(root,"source","contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"p",method_version:"m"},
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{scene_id:"s1",order:1,narration_exact:{mode:"audio_reference",source_audio:"voice.wav",start_s:0,end_s:1,sha256:h},visual_idea:"x",screen_text:"x",planned_duration_s:1,image:{candidates:[],selected:null,selection_reason:null},breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}}],
    audio:{state:"ready",reference:"voice.wav",sha256:h},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(root,"picks","selections.json"),"{}");
  assert.throws(()=>promoteStoryboard(resolve(root,"source","contract.json"),resolve(root,"picks","selections.json"),resolve(root,"out.json")),/missing selected image/);
});

test("promotion accepts FULL_REUSE layered scene without generated scene image",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-reuse-"));
  const source=resolve(root,"source"); const picks=resolve(root,"picks"); const out=resolve(root,"out");
  mkdirSync(source,{recursive:true}); mkdirSync(picks,{recursive:true}); mkdirSync(out,{recursive:true});
  const audio=Buffer.from("audio-reuse"); writeFileSync(resolve(source,"voice.wav"),audio);
  const bg=Buffer.from("bg"); const owl=Buffer.from("owl");
  writeFileSync(resolve(source,"bg.png"),bg); writeFileSync(resolve(source,"owl.png"),owl);
  const h=hash(audio);
  writeFileSync(resolve(source,"contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"p",method_version:"m"},
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{
      scene_id:"s1",order:1,
      narration_exact:{mode:"audio_reference",source_audio:"voice.wav",start_s:0,end_s:1,sha256:h},
      visual_idea:"x",screen_text:"x",planned_duration_s:1,
      image:{candidates:[],selected:null,selection_reason:null},
      asset_resolution:{status:"FULL_REUSE"},
      composition:{background:"bg.png",character_pose:{path:"owl.png",anchor:"bottom-center"}},
      breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}
    }],
    audio:{state:"ready",reference:"voice.wav",sha256:h},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(picks,"selections.json"),"{}");
  promoteStoryboard(resolve(source,"contract.json"),resolve(picks,"selections.json"),resolve(out,"render-ready.json"));
  const promoted=JSON.parse(readFileSync(resolve(out,"render-ready.json"),"utf8"));
  assert.match(promoted.scenes[0].composition.background,/^assets\/composition\//);
  assert.match(promoted.scenes[0].composition.character_pose.path,/^assets\/composition\//);
  assert.match(promoted.scenes[0].image.selection_reason,/reusable asset graph/);
  assert.equal(promoted.validation.publication_authorized,false);
});


test("promotion applies sand GLOBAL branding exactly once",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-brand-"));
  const source=resolve(root,"source"); const picks=resolve(root,"picks"); const out=resolve(root,"out");
  mkdirSync(source,{recursive:true}); mkdirSync(picks,{recursive:true}); mkdirSync(out,{recursive:true});
  const audio=Buffer.from("audio-brand"); writeFileSync(resolve(source,"voice.wav"),audio);
  const image=Buffer.from("image-brand"); writeFileSync(resolve(picks,"s1.png"),image);
  const h=hash(audio);
  writeFileSync(resolve(source,"contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"2.5-V4.3",method_version:"VIDEO_METHOD_V4.3"},
    creative:{branding:{text:"Le Hibou Rusé",position:"bottom-center",color:"sand"}},
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{scene_id:"s1",order:1,narration_exact:{mode:"audio_reference",source_audio:"voice.wav",start_s:0,end_s:1,sha256:h},visual_idea:"x",screen_text:"AUTRE TEXTE",planned_duration_s:1,image:{candidates:[],selected:null,selection_reason:null},breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}}],
    audio:{state:"ready",reference:"voice.wav",sha256:h},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(picks,"selections.json"),JSON.stringify({s1:{selected:"s1.png",candidates:["s1.png"],selection_reason:"QC pass"}}));
  promoteStoryboard(resolve(source,"contract.json"),resolve(picks,"selections.json"),resolve(out,"render-ready.json"));
  const promoted=JSON.parse(readFileSync(resolve(out,"render-ready.json"),"utf8"));
  assert.equal(promoted.scenes[0].composition.brand_signature.text,"Le Hibou Rusé");
  assert.equal(promoted.scenes[0].composition.brand_signature.font_color,"#C7A65A");
});

test("CTA scene does not duplicate the Le Hibou Rusé brand signature",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-cta-"));
  const source=resolve(root,"source"); const picks=resolve(root,"picks"); const out=resolve(root,"out");
  mkdirSync(source,{recursive:true}); mkdirSync(picks,{recursive:true}); mkdirSync(out,{recursive:true});
  const audio=Buffer.from("audio-cta"); writeFileSync(resolve(source,"voice.wav"),audio);
  const image=Buffer.from("image-cta"); writeFileSync(resolve(picks,"s1.png"),image);
  const h=hash(audio);
  writeFileSync(resolve(source,"contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"2.5-V4.3",method_version:"VIDEO_METHOD_V4.3"},
    creative:{branding:{text:"Le Hibou Rusé",position:"bottom-center",color:"sand"}},
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{scene_id:"s1",order:1,narration_exact:{mode:"audio_reference",source_audio:"voice.wav",start_s:0,end_s:1,sha256:h},visual_idea:"x",screen_text:"LE HIBOU RUSÉ / ABONNE-TOI",planned_duration_s:1,image:{candidates:[],selected:null,selection_reason:null},breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}}],
    audio:{state:"ready",reference:"voice.wav",sha256:h},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(picks,"selections.json"),JSON.stringify({s1:{selected:"s1.png",candidates:["s1.png"],selection_reason:"QC pass"}}));
  promoteStoryboard(resolve(source,"contract.json"),resolve(picks,"selections.json"),resolve(out,"render-ready.json"));
  const promoted=JSON.parse(readFileSync(resolve(out,"render-ready.json"),"utf8"));
  assert.equal(promoted.scenes[0].composition.brand_signature,undefined);
});


test("promotion preserves a resolved pose instead of replacing it with the generic canonical Hibou",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-promote-pose-"));
  const source=resolve(root,"source"); const picks=resolve(root,"picks"); const out=resolve(root,"out");
  mkdirSync(source,{recursive:true}); mkdirSync(picks,{recursive:true}); mkdirSync(out,{recursive:true});
  const audio=Buffer.from("audio-pose"); writeFileSync(resolve(source,"voice.wav"),audio);
  const image=Buffer.from("image-pose"); writeFileSync(resolve(picks,"s1.png"),image);
  const canonical=Buffer.from("canonical-owl"); writeFileSync(resolve(source,"canonical.webp"),canonical);
  const pose=Buffer.from("resolved-pose"); writeFileSync(resolve(source,"contract-pose.webp"),pose);
  const h=hash(audio);
  writeFileSync(resolve(source,"contract.json"),JSON.stringify({
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",
    content:{content_id:"x",script_version:1,profile_version:"2.5-V4.3",method_version:"VIDEO_METHOD_V4.3"},
    creative:{
      reference_image_local:resolve(source,"canonical.webp"),
      branding:{text:"Le Hibou Rusé",position:"bottom-center",color:"sand"}
    },
    engine:{renderer:"ffmpeg",renderer_version:"1",fps:30,width:1080,height:1920},
    scenes:[{
      scene_id:"s1",order:1,
      narration_exact:{mode:"audio_reference",source_audio:"voice.wav",start_s:0,end_s:1,sha256:h},
      visual_idea:"x",screen_text:"CONTRAT",planned_duration_s:1,
      framing:{hibou:true},
      composition:{character_pose:{path:resolve(source,"contract-pose.webp"),anchor:"bottom-center",width:430,z:20}},
      pose_registry_resolution:{status:"READY_REUSE",pose_id:"contrat"},
      image:{candidates:[],selected:null,selection_reason:null},
      breath_unit:"x",voice:{target_wpm:200,relative_speed_pct:100,pause_after_ms:0,emphasis:"x",intent:"x"}
    }],
    audio:{state:"ready",reference:"voice.wav",sha256:h},music:{},subtitles:{},qc:{},validation:{}
  }));
  writeFileSync(resolve(picks,"selections.json"),JSON.stringify({s1:{selected:"s1.png",candidates:["s1.png"],selection_reason:"QC pass"}}));
  promoteStoryboard(resolve(source,"contract.json"),resolve(picks,"selections.json"),resolve(out,"render-ready.json"));
  const promoted=JSON.parse(readFileSync(resolve(out,"render-ready.json"),"utf8"));
  assert.match(promoted.scenes[0].composition.character_pose.path,/contract-pose/);
  assert.equal(promoted.scenes[0].pose_registry_resolution.pose_id,"contrat");
  assert.doesNotMatch(promoted.scenes[0].composition.character_pose.path,/canonical/);
});
