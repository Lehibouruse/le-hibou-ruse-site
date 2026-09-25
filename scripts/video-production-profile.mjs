#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message){throw new Error(message);}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function round(value,digits=3){const n=finite(value);return n===null?null:Number(n.toFixed(digits));}
function metric(profile,name){
  const m=profile?.overall?.[name]||{};
  return {
    n:Number(m.n||0),
    median:round(m.median),
    p25:round(m.p25),
    p75:round(m.p75)
  };
}
function hashJson(value){
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function experiment(id,label,m,unit,{minDelta=0}={}){
  if(m.n<2||m.p25===null||m.p75===null||Math.abs(m.p75-m.p25)<=minDelta) return null;
  return {
    id,
    label,
    status:"PLANNED_NOT_RUN",
    source_metric:{n:m.n,p25:m.p25,p75:m.p75,unit},
    variant_a:{target:m.p25},
    variant_b:{target:m.p75},
    publication_authorized:false,
    interpretation:"Compare only with denominators and downstream quality/business metrics; do not infer causality from a single content."
  };
}
export const FORMAT_CATALOG=Object.freeze({
  ILLUSTRATED_EXPLAINER:{
    supported:true,
    description:"Hibou principal: narration + compositions illustrées + captions/chiffres/objets + micro-mouvement.",
    modalities:["narration","layered_composition","caption","numeric_overlay","object_swap","micro_zoom"]
  },
  FACE_CAM_AUTHORITY:{
    supported:false,
    description:"Profil benchmark conservé pour comparaison; pas de synthèse d'identité/visage concurrent.",
    modalities:["face_camera","caption"]
  },
  DENSE_PODCAST:{
    supported:false,
    description:"Profil benchmark conservé pour comparaison; non retenu comme moteur Hibou principal.",
    modalities:["dense_voice","caption","static_frame"]
  }
});

export function buildHibouProductionProfile(style,{format="ILLUSTRATED_EXPLAINER"}={}){
  if(style?.schema!=="HIBOU_VIDEO_STYLE_PROFILE_V1") fail("unsupported style profile");
  if(!FORMAT_CATALOG[format]) fail("unknown format profile");
  const m={
    wpm:metric(style,"speech_wpm"),
    prosody:metric(style,"prosody_semitone_range"),
    attention:metric(style,"attention_event_interval_s"),
    composition:metric(style,"composition_change_interval_s"),
    staticHold:metric(style,"static_hold_ratio"),
    motion:metric(style,"motion_budget"),
    reuse:metric(style,"asset_reuse_rate"),
    captionDuration:metric(style,"caption_duration_s"),
    captionTokens:metric(style,"caption_token_count"),
    silence:metric(style,"silence_ratio")
  };
  const zoom=finite(style.production_profile?.motion?.default_zoom_percent);
  if(zoom===null||zoom<2||zoom>4) fail("style profile has no valid renderer zoom");
  const targets={
    narration:{
      target_wpm:m.wpm.median,
      target_prosody_semitone_range:m.prosody.median,
      target_silence_ratio:m.silence.median
    },
    attention:{
      event_interval_s:m.attention.median,
      evidence_method:"ffmpeg_scene_score_sensitive_proxy",
      proxy_only:true
    },
    composition:{
      change_interval_s:m.composition.median,
      static_hold_ratio:m.staticHold.median
    },
    captions:{
      duration_s:m.captionDuration.median,
      tokens_per_caption:m.captionTokens.median
    },
    motion:{
      zoom_percent:round(zoom,2),
      motion_budget:m.motion.median
    },
    assets:{
      reuse_rate:m.reuse.median,
      reuse_first:true
    }
  };
  const experiments=[
    experiment("AB_VOICE_PACE","Débit narration",m.wpm,"words_per_minute",{minDelta:3}),
    experiment("AB_ATTENTION_CADENCE","Cadence événements attentionnels proxy",m.attention,"seconds",{minDelta:0.1}),
    experiment("AB_CAPTION_DURATION","Durée des captions",m.captionDuration,"seconds",{minDelta:0.1}),
    experiment("AB_COMPOSITION_CADENCE","Cadence de changement de composition",m.composition,"seconds",{minDelta:0.1})
  ].filter(Boolean);
  return {
    schema:"HIBOU_VIRAL_V2",
    version:"2.0.0",
    generated_at:new Date().toISOString(),
    selected_format:format,
    format:FORMAT_CATALOG[format],
    format_catalog:FORMAT_CATALOG,
    source_profile:{
      schema:style.schema,
      generated_at:style.generated_at||null,
      source_count:Number(style.source_count||0),
      competitor_count:Number(style.competitor_count||0),
      fingerprint:hashJson(style)
    },
    controls:{
      renderer:{
        zoom_percent:round(zoom,2),
        consumption:"actual_engine_control"
      },
      scene_compositor:{
        default_transition:"hard-cut",
        consumption:"hibou_method_control_not_competitor_identity"
      },
      asset_resolution:{
        reuse_first:true,
        consumption:"actual_pipeline_control"
      }
    },
    targets,
    evidence_counts:Object.fromEntries(Object.entries(m).map(([k,v])=>[k,v.n])),
    guidance_status:{
      narration_wpm:"target_qc_only_chatterbox_has_no_native_wpm_control",
      prosody_range:"target_qc_only",
      attention_interval:"planning_target_proxy_not_semantic_ground_truth",
      composition_interval:"planning_target",
      captions:"planning_target",
      motion_budget:"planning_target",
      asset_reuse_rate:"optimization_target"
    },
    experiments,
    policy:{
      original_hibou_identity_required:true,
      copy_competitor_identity:false,
      copy_competitor_voice:false,
      paid_fallback:false,
      human_master_review_required:true,
      publication_authorized:false,
      null_metric_policy:"do_not_impute_missing_corpus_measurements"
    }
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [stylePath,outPath,...rest]=process.argv.slice(2);
  if(!stylePath||!outPath) fail("usage: video-production-profile.mjs style-profile.json output.json [--format=ILLUSTRATED_EXPLAINER]");
  const format=rest.find(x=>x.startsWith("--format="))?.slice(9)||"ILLUSTRATED_EXPLAINER";
  const style=JSON.parse(readFileSync(resolve(stylePath),"utf8"));
  const out=buildHibouProductionProfile(style,{format});
  writeFileSync(resolve(outPath),JSON.stringify(out,null,2)+"\n");
  process.stdout.write(JSON.stringify({ok:true,schema:out.schema,format:out.selected_format,experiments:out.experiments.length})+"\n");
}
