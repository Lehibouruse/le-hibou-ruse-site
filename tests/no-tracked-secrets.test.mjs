import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";

function trackedFiles(){
  const r=spawnSync("git",["ls-files","-z"],{encoding:"utf8"});
  assert.equal(r.status,0,"git ls-files failed");
  return String(r.stdout||"").split("\0").filter(Boolean);
}

const secretPatterns=[
  {name:"private_key",re:new RegExp("-----BEGIN "+"(?:RSA |EC |OPENSSH )?PRIVATE KEY-----")},
  {name:"openai_key",re:new RegExp("\\b"+"sk"+"-(?:proj-)?[A-Za-z0-9_-]{20,}\\b")},
  {name:"github_classic_token",re:new RegExp("\\b"+"ghp"+"_[A-Za-z0-9]{30,}\\b")},
  {name:"github_fine_grained_token",re:new RegExp("\\b"+"github_pat"+"_[A-Za-z0-9_]{30,}\\b")},
];

const binaryExtensions=new Set([".png",".jpg",".jpeg",".gif",".webp",".ico",".mp4",".mov",".mkv",".webm",".zip",".7z",".pdf",".woff",".woff2",".ttf",".otf"]);

test("no real env file is tracked",()=>{
  const envFiles=trackedFiles().filter(path=>{
    const base=path.split("/").pop()||"";
    return (base===".env" || base.startsWith(".env.")) && base!==".env.example";
  });
  assert.deepEqual(envFiles,[]);
});

test("tracked text files contain no high-confidence secret material",()=>{
  const findings=[];
  for(const path of trackedFiles()){
    if(path==="tests/no-tracked-secrets.test.mjs") continue;
    if(binaryExtensions.has(extname(path).toLowerCase())) continue;
    let stat; try{stat=statSync(path);}catch{continue;}
    if(stat.size>2_000_000) continue;
    let content; try{content=readFileSync(path,"utf8");}catch{continue;}
    if(content.includes("\u0000")) continue;
    for(const pattern of secretPatterns){
      if(pattern.re.test(content)) findings.push({path,type:pattern.name});
    }
  }
  assert.deepEqual(findings,[]);
});
