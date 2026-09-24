import assert from "node:assert/strict";
import test from "node:test";
import { retentionAudit, retentionPlan } from "../lib/data-retention.mjs";

const now=Date.parse("2026-09-24T12:00:00Z");
const rec=(id,fields,createdTime="2026-09-01T00:00:00Z")=>({id,fields,createdTime});

test("retention plan proposes purge only after published periods and never auto-executes",()=>{
  const input={
    now,
    conversionEvents:[
      rec("ce-old",{"Occurred At":"2025-01-01T00:00:00Z"}),
      rec("ce-new",{"Occurred At":"2026-09-01T00:00:00Z"}),
    ],
    automationLogs:[rec("log-old",{"Dernière exécution":"2025-01-01T00:00:00Z"})],
    prospects:[
      rec("lead-old",{Date:"2022-01-01T00:00:00Z"}),
      rec("lead-new",{Date:"2026-01-01T00:00:00Z"}),
    ],
    sales:[rec("sale-old",{Date:"2020-01-01T00:00:00Z"})],
  };
  const audit=retentionAudit(input);
  assert.equal(audit.conversion_events.counts.candidate_for_purge,1);
  const plan=retentionPlan(input);
  assert.equal(plan.mode,"dry_run");
  assert.equal(plan.destructive_actions,false);
  assert.equal(plan.safety.automatic_execution,false);
  assert.equal(plan.safety.sales_deletion_planned,false);
  assert.equal(plan.actions.find(x=>x.record_id==="ce-old").action,"purge_after_review");
  assert.equal(plan.actions.find(x=>x.record_id==="lead-old").action,"purge_or_anonymize_after_review");
  assert.equal(plan.actions.find(x=>x.record_id==="sale-old").action,"keep_legal_archive");
});

test("invalid dates are routed to manual review instead of deletion",()=>{
  const plan=retentionPlan({now,prospects:[rec("bad",{Date:"not-a-date"})]});
  assert.equal(plan.actions[0].action,"manual_review");
  assert.equal(plan.counts.manual_review,1);
});
