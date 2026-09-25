#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
function fail(m){throw new Error(m);}
export function applyStyleProfile(contract,profile,{force=false}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported video contract");
  if(profile?.schema!=="HIBOU_VIDEO_STYLE_PROFILE_V1") fail("unsupported style profile");
  const zoom=Number(profile.production_profile?.motion?.default_zoom_percent);
  if(!Number.isFinite(zoom)||zoom<2||zoom>4) fail("invalid style zoom");
  const out=structuredClone(contract);
  out.style_profile={
    schema:profile.schema,
    generated_at:profile.generated_at,
    source_count:profile.source_count,
    competitor_count:profile.competitor_count,
    applied_defaults:{zoom_percent:zoom},
    policy:profile.production_profile.policy
  };
  out.scenes=(out.scenes||[]).map(scene=>{
    if(!force && Number.isFinite(Number(scene.zoom_percent))) return scene;
    return {...scene,zoom_percent:zoom};
  });
  return out;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,profilePath,outPath,...rest]=process.argv.slice(2);
  if(!contractPath||!profilePath||!outPath) fail("usage: video-style-apply.mjs contract.json style-profile.json output.json [--force]");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const profile=JSON.parse(readFileSync(resolve(profilePath),"utf8"));
  const out=applyStyleProfile(contract,profile,{force:rest.includes("--force")});
  writeFileSync(resolve(outPath),JSON.stringify(out,null,2)+"\n");
  process.stdout.write(JSON.stringify({ok:true,scenes:out.scenes.length,zoom:out.style_profile.applied_defaults.zoom_percent})+"\n");
}
