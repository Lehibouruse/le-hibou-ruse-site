#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set([".git","node_modules",".next",".hibou-video-artifacts"]);
const SKIP_FILES = new Set(["scripts/security-self-check.mjs"]);
const TEXT_EXT = new Set([".js",".mjs",".cjs",".ts",".tsx",".json",".md",".yml",".yaml",".ps1",".sh",".env",".txt"]);

function walk(dir, out=[]){
  for(const name of readdirSync(dir)){
    if(SKIP.has(name)) continue;
    const path=join(dir,name);
    const st=statSync(path);
    if(st.isDirectory()) walk(path,out);
    else out.push(path);
  }
  return out;
}
function ext(path){
  const i=path.lastIndexOf(".");
  return i>=0?path.slice(i):"";
}
function isText(path){
  return TEXT_EXT.has(ext(path)) || path.endsWith(".env.example") || path.endsWith(".gitignore");
}
function lineFindings(path,text){
  const rel=relative(ROOT,path).replaceAll("\\","/");
  const rows=text.split(/\r?\n/);
  const findings=[];
  const add=(severity,rule,line,message)=>findings.push({severity,rule,file:rel,line,message});
  rows.forEach((row,index)=>{
    const line=index+1;
    if(/AKIA[0-9A-Z]{16}/.test(row)) add("high","possible_aws_key",line,"Possible AWS access key pattern");
    if(/sk-[A-Za-z0-9_-]{20,}/.test(row)) add("high","possible_api_key",line,"Possible API key pattern");
    if(/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(row)) add("critical","private_key",line,"Private key material detected");
    if(/0\.0\.0\.0/.test(row) && /(listen|host|bind|server)/i.test(row)) add("medium","public_listener",line,"Possible public listener; confirm this is intentional");
    if(/shell\s*:\s*true/.test(row)) add("medium","shell_true",line,"Child process shell:true requires review");
    if(/\beval\s*\(/.test(row)) add("high","eval",line,"eval() requires review");
    if(/dangerouslySetInnerHTML/.test(row)) add("medium","dangerous_html",line,"dangerouslySetInnerHTML requires sanitization review");
  });
  return findings;
}

const files=walk(ROOT).filter((file)=>isText(file) && !SKIP_FILES.has(relative(ROOT,file).replaceAll("\\","/")));
const findings=[];
for(const file of files){
  let text="";
  try{text=readFileSync(file,"utf8");}catch{continue;}
  findings.push(...lineFindings(file,text));
}
const summary={
  schema:"HIBOU_SECURITY_SELF_CHECK_V1",
  scanned_files:files.length,
  findings,
  counts:findings.reduce((a,f)=>{a[f.severity]=(a[f.severity]||0)+1;return a;},{}),
  note:"Heuristic local static check only; not a substitute for a professional security audit."
};
process.stdout.write(JSON.stringify(summary,null,2)+"\n");
if(findings.some(f=>["critical","high"].includes(f.severity))) process.exitCode=2;
