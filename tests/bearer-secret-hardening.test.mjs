import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bearerSecretAuthorized, serviceAuthorized } from "../lib/admin-auth.mjs";

function req(value){
  return { headers: { get(name){ return String(name).toLowerCase()==="authorization" ? value : null; } } };
}

test("bearerSecretAuthorized is fail-closed and exact",()=>{
  assert.equal(bearerSecretAuthorized(req("Bearer abc"),""),false);
  assert.equal(bearerSecretAuthorized(req(""),"abc"),false);
  assert.equal(bearerSecretAuthorized(req("Basic abc"),"abc"),false);
  assert.equal(bearerSecretAuthorized(req("Bearer abc"),"abc"),true);
  assert.equal(bearerSecretAuthorized(req("Bearer abC"),"abc"),false);
  assert.equal(bearerSecretAuthorized(req("Bearer abc "), "abc"), false);
});

test("serviceAuthorized preserves control-plane then cron fallback semantics",()=>{
  assert.equal(serviceAuthorized(req("Bearer control"),{HIBOU_CONTROL_PLANE_SECRET:"control",CRON_SECRET:"cron"}),true);
  assert.equal(serviceAuthorized(req("Bearer cron"),{HIBOU_CONTROL_PLANE_SECRET:"control",CRON_SECRET:"cron"}),false);
  assert.equal(serviceAuthorized(req("Bearer cron"),{HIBOU_CONTROL_PLANE_SECRET:"",CRON_SECRET:"cron"}),true);
});

test("sensitive cron routes use the centralized timing-safe bearer helper",()=>{
  const routes=[
    "../app/api/book-finalizer/route.js",
    "../app/api/social/route.js",
    "../app/api/social/connection-test/route.js",
    "../app/api/system-watchdog/route.js",
    "../app/api/health/route.js",
  ];
  for(const relative of routes){
    const source=readFileSync(new URL(relative,import.meta.url),"utf8");
    assert.match(source,/bearerSecretAuthorized/);
    assert.doesNotMatch(source,/token === process\.env\.CRON_SECRET/);
    assert.doesNotMatch(source,/authorization[^\n]*!==[^\n]*Bearer/);
  }
});
