import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchRedditMetrics} from '../lib/social-reddit.mjs';
import {fetchBlueskyMetrics} from '../lib/social-bluesky-metrics.mjs';
import {publicationFields} from '../lib/social-publication.mjs';
import {contentMetricTargets} from '../lib/social-metrics.mjs';
const json=data=>new Response(JSON.stringify(data));
test('Reddit retains signed score and never invents views or likes',async()=>{
 const env={REDDIT_API_APPROVED:'true',REDDIT_ACCESS_TOKEN:'test-token',REDDIT_USER_AGENT:'test-agent'};
 const result=await fetchRedditMetrics('t3_abc',env,async(url)=>{assert.equal(url,'https://oauth.reddit.com/api/info?id=t3_abc');return json({data:{children:[{kind:'t3',data:{name:'t3_abc',score:-2,num_comments:7,upvote_ratio:0.4}}]}});});
 assert.equal(result.score,-2);assert.equal(result.comments,7);assert.equal(result.views,null);assert.equal(result.likes,null);
 await assert.rejects(fetchRedditMetrics('https://example.com',env),/t3_/);
});
test('Bluesky reads only the requested public post without sending credentials',async()=>{
 const uri='at://did:plc:example/app.bsky.feed.post/abc';
 const result=await fetchBlueskyMetrics(uri,{BLUESKY_APP_PASSWORD:'not-sent'},async(url,options)=>{
  assert.equal(url.origin,'https://public.api.bsky.app');assert.equal(url.searchParams.get('uris'),uri);assert.equal(options.headers,undefined);
  return json({posts:[{uri,likeCount:3,replyCount:1,repostCount:2,quoteCount:4}]});});
 assert.equal(result.likes,3);assert.equal(result.shares,2);assert.equal(result.quotes,4);assert.equal(result.views,null);
});
test('Bluesky and Reddit publication IDs are persisted and discovered for metrics',()=>{
 for(const [provider,id] of [['reddit','t3_abc'],['bluesky','at://did:plc:example/app.bsky.feed.post/abc']]){
  const publication=publicationFields(provider,{result:{post_id:id,url:'https://example.com/post'}});
  assert.equal(publication.id,id);assert.equal(publication.reason,'');
  const targets=contentMetricTargets({id:'recContent',fields:publication.fields});assert.equal(targets[0].provider,provider);assert.equal(targets[0].external_id,id);
 }
});

test('Unavailable metrics stay empty in Airtable; Reddit score remains distinct from likes',async()=>{
 const {buildSocialPerformanceFields}=await import('../lib/social-performance-fields.mjs');
 const fields=buildSocialPerformanceFields({target:{provider:'reddit'},metrics:{views:null,likes:null,comments:3,score:-2,upvote_ratio:0.4,unavailable_metrics:['views','likes']}});
 assert.equal(fields.Views,null);assert.equal(fields.Likes,null);assert.equal(fields.Comments,3);
 assert.equal(JSON.parse(fields['Metrics Details JSON']).score,-2);
});
