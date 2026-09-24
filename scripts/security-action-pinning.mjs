#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const ROOT=process.cwd();
const WORKFLOWS=resolve(ROOT,".github","workflows");
const SHA40=/^[0-9a-f]{40}$/i;

function walk(dir,out=[]){
  for(const name of readdirSync(dir)){
    const path=resolve(dir,name);
    const st=statSync(path);
    if(st.isDirectory()) walk(path,out);
    else if(/\.ya?ml$/i.test(name)) out.push(path);
  }
  return out;
}

export function scanWorkflowText(path,text){
  const findings=[];
  const refs=[];
  const rows=String(text||"").split(/\r?\n/);
  rows.forEach((row,index)=>{
    const match=row.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if(!match) return;
    const uses=match[1];
    if(uses.startsWith("./")||uses.startsWith("docker://")){
      refs.push({file:path,line:index+1,uses,kind:"local_or_docker",pinned:true});
      return;
    }
    const at=uses.lastIndexOf("@");
    const ref=at>=0?uses.slice(at+1):"";
    const pinned=SHA40.test(ref);
    refs.push({file:path,line:index+1,uses,kind:"third_party",pinned});
    if(!pinned){
      findings.push({
        severity:"medium",
        rule:"mutable_github_action_ref",
        file:path,
        line:index+1,
        uses,
        message:"Third-party GitHub Action uses a mutable tag/branch instead of an immutable 40-char commit SHA."
      });
    }
  });
  return {refs,findings};
}

export function scanWorkflows(root=WORKFLOWS){
  const files=walk(root);
  const refs=[];
  const findings=[];
  for(const file of files){
    const rel=relative(ROOT,file).replaceAll("\\","/");
    const result=scanWorkflowText(rel,readFileSync(file,"utf8"));
    refs.push(...result.refs);
    findings.push(...result.findings);
  }
  return {
    schema:"HIBOU_GITHUB_ACTION_PINNING_AUDIT_V1",
    workflow_files:files.length,
    action_refs:refs.length,
    pinned_refs:refs.filter(x=>x.pinned).length,
    mutable_refs:refs.filter(x=>!x.pinned&&x.kind==="third_party").length,
    findings,
    note:"Static audit only. It does not modify workflows or contact external services."
  };
}

if(import.meta.url==="file://"+process.argv[1]){
  const strict=process.argv.includes("--strict");
  const result=scanWorkflows();
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(strict&&result.mutable_refs>0) process.exitCode=2;
}
