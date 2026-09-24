#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const planPath=resolve(process.cwd(),"config","secret-rotation-plan.json");
const plan=JSON.parse(readFileSync(planPath,"utf8"));

function clean(value){ return String(value ?? "").trim(); }
function wildcardPresent(pattern, env){
  if(!pattern.includes("*")) return Boolean(clean(env[pattern]));
  const [prefix,suffix]=pattern.split("*");
  return Object.keys(env).some((key)=>{
    if(prefix && !key.startsWith(prefix)) return false;
    if(suffix && !key.endsWith(suffix)) return false;
    return Boolean(clean(env[key]));
  });
}

export function buildRotationRehearsal(planData=plan, env=process.env){
  return {
    schema:"HIBOU_SECRET_ROTATION_REHEARSAL_V1",
    generated_at:new Date().toISOString(),
    dry_run:true,
    network_access:false,
    external_mutation:false,
    groups:(planData.groups||[]).map((group)=>({
      id:group.id,
      priority:group.priority,
      secret_names:group.secrets,
      presence:(group.secrets||[]).map((name)=>({name,present:wildcardPresent(name,env)})),
      consumers:group.consumers,
      validation:group.validation,
      special_warning:group.special_warning||null,
      steps:[
        "inventory_consumers",
        "issue_new_secret_out_of_band",
        "stage_new_secret_without_deleting_old",
        "run_read_only_or_test_only_canary",
        "cut_over_consumers",
        "revoke_old_secret",
        "verify_old_secret_rejected",
        "record_rotation_evidence"
      ]
    })),
    policy:planData.policy,
    note:"Dry-run only: secret values are never emitted and no provider/Vercel/Airtable/GitHub mutation is performed."
  };
}

if(import.meta.url==="file://"+process.argv[1]){
  process.stdout.write(JSON.stringify(buildRotationRehearsal(),null,2)+"\n");
}
