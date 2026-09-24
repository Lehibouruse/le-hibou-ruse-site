#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT=process.cwd();

function walk(dir,out=[]){
  for(const name of readdirSync(dir)){
    const path=join(dir,name);
    const st=statSync(path);
    if(st.isDirectory()) walk(path,out);
    else if(/route\.(js|mjs|ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

function has(source,patterns){ return patterns.some((p)=>p.test(source)); }

export function classifyRoute(source){
  const methods=[...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m)=>m[1]);
  const writes=has(source,[
    /\bcreateRecord\s*\(/,
    /\bupdateRecord\s*\(/,
    /\bdeleteRecord\s*\(/,
    /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
    /\bcreate[A-Z][A-Za-z0-9_]*\s*\(/,
    /\brevoke[A-Z][A-Za-z0-9_]*\s*\(/,
  ]);
  const protectedAuth=has(source,[
    /adminAuthorized\s*\(/,
    /adminOrServiceAuthorized\s*\(/,
    /serviceAuthorized\s*\(/,
    /verifyGithubActionsToken\s*\(/,
    /authorization["']?\s*\)|headers\.get\(["']authorization["']\)/i,
    /CRON_SECRET/,
  ]);
  const signedWebhook=has(source,[
    /verifyLemonSignature\s*\(/,
    /x-signature/i,
    /verify[A-Za-z0-9_]*(?:Signature|Webhook)\s*\(/,
    /createHmac\s*\(/,
  ]);
  const browserGuard=has(source,[
    /ALLOWED_ORIGINS/,
    /allowedOrigin\s*\(/,
    /MAX_BODY_BYTES/,
  ]);
  const oauthFlow=has(source,[
    /oauth/i,
    /sealedState|verifyState|stateToken|state\s*=/,
  ]);
  const methodsSet=[...new Set(methods)];

  let classification="needs_review";
  if(signedWebhook) classification="signed_webhook";
  else if(protectedAuth) classification="protected";
  else if(browserGuard) classification="public_guarded";
  else if(oauthFlow) classification="oauth_public_flow";
  else if(methodsSet.length && methodsSet.every((m)=>m==="GET") && !writes) classification="public_read";

  return {
    classification,
    methods:methodsSet,
    writes,
    protected_auth:protectedAuth,
    signed_webhook:signedWebhook,
    browser_guard:browserGuard,
    oauth_flow:oauthFlow,
  };
}

export function auditApi(root=ROOT){
  const apiRoot=resolve(root,"app/api");
  const routes=walk(apiRoot).sort().map((path)=>{
    const source=readFileSync(path,"utf8");
    return {path:relative(root,path).replaceAll("\\","/"),...classifyRoute(source)};
  });
  const counts=routes.reduce((acc,row)=>{acc[row.classification]=(acc[row.classification]||0)+1;return acc;},{});
  return {
    schema:"HIBOU_API_SURFACE_AUDIT_V1",
    generated_at:new Date().toISOString(),
    route_count:routes.length,
    counts,
    needs_review:routes.filter((r)=>r.classification==="needs_review"),
    routes,
    note:"Static classification only. Public does not mean unsafe; needs_review means the route lacks a recognized guard marker and requires human inspection.",
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const strict=process.argv.includes("--strict");
  const report=auditApi();
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(strict && report.needs_review.length) process.exitCode=2;
}
