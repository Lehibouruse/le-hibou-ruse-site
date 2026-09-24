import assert from "node:assert/strict";
import test from "node:test";
import { scanWorkflowText } from "../scripts/security-action-pinning.mjs";
import { buildRotationRehearsal } from "../scripts/secret-rotation-rehearsal.mjs";

test("action audit flags mutable third-party refs only",()=>{
  const yml=[
    "steps:",
    "  - uses: actions/checkout@v4",
    "  - uses: owner/tool@0123456789abcdef0123456789abcdef01234567",
    "  - uses: ./local-action"
  ].join("\n");
  const r=scanWorkflowText(".github/workflows/demo.yml",yml);
  assert.equal(r.findings.length,1);
  assert.equal(r.findings[0].uses,"actions/checkout@v4");
  assert.equal(r.refs.find(x=>x.uses.includes("012345"))?.pinned,true);
  assert.equal(r.refs.find(x=>x.uses==="./local-action")?.pinned,true);
});

test("rotation rehearsal exposes presence but never values",()=>{
  const plan={
    groups:[{
      id:"demo",
      priority:"P1",
      secrets:["DEMO_SECRET","SOCIAL_*"],
      consumers:["test"],
      validation:["read_only"]
    }],
    policy:{never_print_secret_values:true}
  };
  const env={DEMO_SECRET:"super-secret-value",SOCIAL_TOKEN:"another-secret"};
  const r=buildRotationRehearsal(plan,env);
  const rendered=JSON.stringify(r);
  assert.equal(r.dry_run,true);
  assert.equal(r.network_access,false);
  assert.equal(r.external_mutation,false);
  assert.equal(r.groups[0].presence[0].present,true);
  assert.equal(r.groups[0].presence[1].present,true);
  assert.equal(rendered.includes("super-secret-value"),false);
  assert.equal(rendered.includes("another-secret"),false);
});
