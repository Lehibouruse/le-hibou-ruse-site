import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("V5 launcher enables Airtable timeline and prosody before starting the worker",()=>{
  const source=readFileSync(new URL("../scripts/start-hibou-video-v5-local.ps1",import.meta.url),"utf8");
  const launchAt=source.indexOf("$LocalProcess = Start-Process");
  assert(launchAt>0);
  for(const name of ["HIBOU_VIDEO_TIMELINE_V1","HIBOU_VIDEO_PROSODY_V1"]){
    const gate=`$env:${name} = "true"`;
    const gateAt=source.indexOf(gate);
    assert(gateAt>0&&gateAt<launchAt,`${name} must be set before worker launch`);
  }
  assert.doesNotMatch(source,/if \(\$AlreadyLocal\)\s*\{[\s\S]*?return\s*\}/,
    "activation must restart an idle local worker so it inherits new gates");
});
