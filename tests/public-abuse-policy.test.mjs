import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const policy=JSON.parse(readFileSync(new URL("../config/public-abuse-policy.json",import.meta.url),"utf8"));

test("public abuse policy starts in observe-only mode and covers key write routes",()=>{
  assert.equal(policy.mode,"observe_first");
  const paths=new Set(policy.routes.map(x=>x.path));
  for(const path of ["/api/leads","/api/retractation","/api/conversion-event","/api/commerce/digital-supply-consent","/api/commerce/access","/api/commerce/lemon-webhook"]){
    assert.equal(paths.has(path),true);
  }
});

test("signed Lemon webhook is not assigned a strict consumer-style per-IP threshold",()=>{
  const webhook=policy.routes.find(x=>x.path==="/api/commerce/lemon-webhook");
  assert.equal(webhook.initial_observe_threshold_per_ip_per_minute,null);
  assert.match(webhook.future_action,/monitor_do_not_apply_strict_per_ip_limit/);
});

test("withdrawal threshold is documented as non-obstructive",()=>{
  const route=policy.routes.find(x=>x.path==="/api/retractation");
  assert.ok(route.initial_observe_threshold_per_ip_per_minute>=5);
  assert.match(route.special_rule,/legitimate withdrawal/i);
});
