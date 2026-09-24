import assert from "node:assert/strict";
import test from "node:test";
import { redditIdentity, fetchRedditMetrics, dispatchReddit } from "../lib/social-reddit.mjs";
import { buildSocialAuthorization, oauthProviderReadiness } from "../lib/social-oauth.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../lib/social-gateway.mjs";
import { contentMetricTargets } from "../lib/social-metrics.mjs";
import { publicationFields } from "../lib/social-publication.mjs";
import { testSocialConnection } from "../lib/social-connection-health.mjs";
import { buildSocialControlPlane } from "../lib/social-control-plane.mjs";

const noFetch=async()=>{ throw new Error("Unexpected remote request"); };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});

const approved={
  REDDIT_API_APPROVED:"true",
  REDDIT_CLIENT_ID:"client",
  REDDIT_CLIENT_SECRET:"secret",
  REDDIT_ACCESS_TOKEN:"token",
  REDDIT_USER_AGENT:"web:le-hibou-ruse:test (by /u/hibou_test)",
  REDDIT_EXPECTED_USERNAME:"hibou_test",
  REDDIT_SUBREDDIT:"hibou_test",
  HIBOU_PUBLIC_BASE_URL:"https://d4d5d6.com",
  HIBOU_SOCIAL_VAULT_KEY:Buffer.alloc(32,7).toString("base64url"),
};

test("Reddit stays unavailable before explicit external approval",async()=>{
  const blocked={...approved,REDDIT_API_APPROVED:"false"};
  assert.throws(()=>buildSocialAuthorization("reddit",blocked),/approbation API commerciale/);
  assert.equal(oauthProviderReadiness(blocked).find(x=>x.provider==="reddit").ready,false);
  assert.equal(socialGatewayStatus(blocked).find(x=>x.provider==="reddit").configured,false);
  await assert.rejects(redditIdentity(blocked,noFetch),/approbation API commerciale/);
  await assert.rejects(dispatchReddit({title:"Test",caption:"Texte"},blocked,noFetch),/approbation API commerciale/);
  await assert.rejects(dispatchSocialPost({provider:"reddit",title:"Test",caption:"Texte",dry_run:false},blocked),/approbation API commerciale/);
  const health=await testSocialConnection("reddit",blocked,noFetch);
  assert.equal(health.state,"EXTERNAL_APPROVAL_REQUIRED");
});

test("Reddit dry-run is allowed but performs no remote call",async()=>{
  const result=await dispatchSocialPost({provider:"reddit",title:"Test",caption:"Texte"},{
    REDDIT_API_APPROVED:"false",
  });
  assert.equal(result.dry_run,true);
  assert.equal(result.gateway.configured,false);
});

test("Reddit OAuth requests permanent identity/read/submit only after approval",()=>{
  const auth=buildSocialAuthorization("reddit",approved);
  const url=new URL(auth.url);
  assert.equal(url.origin,"https://www.reddit.com");
  assert.equal(url.searchParams.get("duration"),"permanent");
  assert.equal(url.searchParams.get("scope"),"identity read submit");
  assert.equal(url.searchParams.get("redirect_uri"),"https://d4d5d6.com/api/social/oauth/reddit/callback");
  assert.ok(url.searchParams.get("state"));
  assert.ok(!auth.url.includes(approved.REDDIT_CLIENT_SECRET));
});

test("Reddit identity validates the exact Hibou account",async()=>{
  const identity=await redditIdentity(approved,async(url,options)=>{
    assert.equal(url,"https://oauth.reddit.com/api/v1/me");
    assert.equal(options.headers.Authorization,"Bearer token");
    return json({id:"abc",name:"hibou_test"});
  });
  assert.equal(identity.publicId,"hibou_test");
  await assert.rejects(
    redditIdentity(approved,async()=>json({id:"x",name:"other"})),
    /ne correspond pas/,
  );
});

test("Reddit metrics keep score distinct and never invent views or likes",async()=>{
  const result=await fetchRedditMetrics("t3_abc",approved,async(url)=>{
    assert.equal(url,"https://oauth.reddit.com/api/info?id=t3_abc");
    return json({data:{children:[{kind:"t3",data:{name:"t3_abc",score:-2,num_comments:7,upvote_ratio:0.4}}]}});
  });
  assert.equal(result.score,-2);
  assert.equal(result.comments,7);
  assert.equal(result.views,null);
  assert.equal(result.likes,null);
});

test("Reddit publication IDs map to existing Airtable fields",()=>{
  const publication=publicationFields("reddit",{result:{post_id:"t3_abc",url:"https://www.reddit.com/comments/abc/"}});
  assert.equal(publication.fields["ID Reddit"],"t3_abc");
  const targets=contentMetricTargets({id:"recContent",fields:publication.fields});
  assert.equal(targets.length,1);
  assert.equal(targets[0].provider,"reddit");
});

test("Reddit control plane exposes the external approval blocker",()=>{
  const readiness=oauthProviderReadiness({...approved,REDDIT_API_APPROVED:"false"});
  const snapshot=buildSocialControlPlane({readiness,credentials:[],env:{...approved,REDDIT_API_APPROVED:"false"}});
  const reddit=snapshot.providers.find(x=>x.provider==="reddit");
  assert.equal(reddit.phase,"EXTERNAL_REDDIT_API_APPROVAL_REQUIRED");
  assert.equal(reddit.ready_for_human_approval,false);
});
