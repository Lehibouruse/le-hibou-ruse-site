import assert from "node:assert/strict";
import test from "node:test";
import { classifyRoute } from "../scripts/security-api-surface.mjs";

test("classifies OIDC/admin protected routes",()=>{
  const r=classifyRoute(`
    import { verifyGithubActionsToken } from "./x";
    export async function POST(request){
      const auth=request.headers.get("authorization");
      await verifyGithubActionsToken(auth);
      await updateRecord("t","r",{x:1});
    }`);
  assert.equal(r.classification,"protected");
  assert.equal(r.writes,true);
});

test("classifies signed webhooks before generic public routes",()=>{
  const r=classifyRoute(`
    export async function POST(request){
      const signature=request.headers.get("x-signature");
      if(!verifyLemonSignature("x",signature,"s")) return new Response("",{status:401});
      return new Response("");
    }`);
  assert.equal(r.classification,"signed_webhook");
});

test("classifies guarded public forms",()=>{
  const r=classifyRoute(`
    const ALLOWED_ORIGINS=new Set(["https://example.com"]);
    const MAX_BODY_BYTES=1000;
    function allowedOrigin(){return true;}
    export async function POST(){ return Response.json({ok:true}); }
  `);
  assert.equal(r.classification,"public_guarded");
});

test("marks unguarded mutating routes for review",()=>{
  const r=classifyRoute(`
    export async function POST(){
      await createRecord("table",{x:1});
      return Response.json({ok:true});
    }`);
  assert.equal(r.classification,"needs_review");
  assert.equal(r.writes,true);
});

test("classifies read-only GET routes separately",()=>{
  const r=classifyRoute(`export async function GET(){ return Response.json({ok:true}); }`);
  assert.equal(r.classification,"public_read");
});
