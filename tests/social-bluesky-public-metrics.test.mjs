import test from "node:test";
import assert from "node:assert/strict";
import { fetchBlueskyMetrics } from "../lib/social-bluesky-metrics.mjs";
import { publicationFields } from "../lib/social-publication.mjs";
import { contentMetricTargets, fetchSocialMetrics } from "../lib/social-metrics.mjs";

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});

test("Bluesky public metrics use public.api.bsky.app without credentials", async()=>{
  const uri="at://did:plc:example/app.bsky.feed.post/abc";
  const fetchImpl=async(url,options)=>{
    assert.equal(url.origin,"https://public.api.bsky.app");
    assert.equal(url.searchParams.get("uris"),uri);
    assert.equal(options.headers,undefined);
    return json({posts:[{uri,likeCount:3,replyCount:1,repostCount:2,quoteCount:4}]});
  };
  const result=await fetchSocialMetrics("bluesky",uri,{BLUESKY_APP_PASSWORD:"must-not-be-used"},fetchImpl);
  assert.equal(result.credential_source,"public_api");
  assert.equal(result.likes,3);
  assert.equal(result.comments,1);
  assert.equal(result.shares,2);
  assert.equal(result.quotes,4);
  assert.equal(result.views,null);
});

test("Bluesky rejects non-at URI instead of guessing a post", async()=>{
  await assert.rejects(fetchBlueskyMetrics("https://bsky.app/profile/x/post/y"),/at:\/\//);
});

test("Bluesky publication IDs map to existing Airtable fields and metrics targets",()=>{
  const uri="at://did:plc:example/app.bsky.feed.post/abc";
  const publication=publicationFields("bluesky",{result:{post_id:uri,url:"https://bsky.app/profile/example/post/abc"}});
  assert.equal(publication.fields["ID Bluesky"],uri);
  assert.match(publication.fields["URL Bluesky"],/^https:\/\/bsky\.app/);
  const targets=contentMetricTargets({id:"recContent",fields:publication.fields});
  assert.equal(targets.length,1);
  assert.equal(targets[0].provider,"bluesky");
  assert.equal(targets[0].external_id,uri);
});
