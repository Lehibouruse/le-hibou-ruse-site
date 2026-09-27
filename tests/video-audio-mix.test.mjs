import assert from "node:assert/strict";
import test from "node:test";
import { buildMusicMixPlan, validateMusicPolicy } from "../scripts/video-audio-mix.mjs";

test("music mix plan ducks the GLOBAL music under voice and normalizes final audio",()=>{
 const plan=buildMusicMixPlan({
   voice:"voice.wav",duration_s:42,
   music:{reference:"music.wav",license:"generated_local",level_db:-25,fade_in_s:1,fade_out_s:1.5}
 });
 assert.equal(plan.schema,"HIBOU_AUDIO_MIX_V1");
 assert.equal(plan.global_layer,true);
 assert.equal(plan.paid_fallback,false);
 assert.equal(plan.publication_authorized,false);
 assert.match(plan.filter_complex,/sidechaincompress=/);
 assert.match(plan.filter_complex,/amix=/);
 assert.match(plan.filter_complex,/loudnorm=I=-16/);
 assert.match(plan.filter_complex,/afade=t=in/);
 assert.match(plan.filter_complex,/afade=t=out/);
});

test("uncontrolled music rights fail closed",()=>{
 assert.throws(()=>validateMusicPolicy({reference:"track.mp3",license:"unknown"}),/license not controlled/);
 assert.throws(()=>validateMusicPolicy({reference:"track.mp3",license:"royalty_free_with_documented_license"}),/license_evidence/);
});

test("music levels and ducking controls are bounded",()=>{
 const p=validateMusicPolicy({
   reference:"track.wav",license:"owned",level_db:5,duck_ratio:99,duck_attack_ms:0,duck_release_ms:9999
 });
 assert.equal(p.level_db,-8);
 assert.equal(p.duck_ratio,20);
 assert.equal(p.duck_attack_ms,1);
 assert.equal(p.duck_release_ms,1500);
});
