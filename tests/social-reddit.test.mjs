import test from 'node:test';
import assert from 'node:assert/strict';
import { redditToken, redditIdentity, dispatchReddit } from '../lib/social-reddit.mjs';
import { buildSocialAuthorization, oauthProviderReadiness, completeSocialAuthorization } from '../lib/social-oauth.mjs';
import { socialGatewayStatus, dispatchSocialPost } from '../lib/social-gateway.mjs';
import { buildSocialControlPlane } from '../lib/social-control-plane.mjs';
import { encryptSocialCredential, decryptSocialCredential } from '../lib/social-credential-vault.mjs';
const env = { REDDIT_API_APPROVED:'true', REDDIT_CLIENT_ID:'test-client', REDDIT_CLIENT_SECRET:'test-secret', REDDIT_ACCESS_TOKEN:'test-access', REDDIT_USER_AGENT:'web:hibou-test:v1 (by /u/hibou_test)', REDDIT_SUBREDDIT:'hibou_test', REDDIT_EXPECTED_USERNAME:'hibou_test', HIBOU_PUBLIC_BASE_URL:'https://d4d5d6.com', HIBOU_SOCIAL_VAULT_KEY:Buffer.alloc(32,7).toString('base64url') };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const noFetch=async()=>{throw new Error('Unexpected remote request')};

test('Reddit approval is required before OAuth, tokens, identity and live publication, including webhook',async()=>{
 const blocked={...env,REDDIT_API_APPROVED:'false',HIBOU_SOCIAL_REDDIT_WEBHOOK_URL:'https://example.com/hook'};
 assert.throws(()=>buildSocialAuthorization('reddit',blocked),/autorisation API commerciale/);
 await assert.rejects(redditToken({grant_type:'refresh_token'},blocked,noFetch),/autorisation API commerciale/);
 await assert.rejects(redditIdentity(blocked,noFetch),/autorisation API commerciale/);
 await assert.rejects(dispatchReddit({title:'Test',caption:'Test'},blocked,noFetch),/autorisation API commerciale/);
 await assert.rejects(dispatchSocialPost({provider:'reddit',title:'Test',caption:'Test',dry_run:false},blocked),/autorisation API commerciale/);
 assert.equal(socialGatewayStatus(blocked).find(x=>x.provider==='reddit').configured,false);
});

test('Reddit OAuth requests permanent access with encrypted state and no secret in URL',async()=>{
 const auth=buildSocialAuthorization('reddit',env);const url=new URL(auth.url);
 assert.equal(url.origin,'https://www.reddit.com');assert.equal(url.searchParams.get('duration'),'permanent');
 assert.equal(url.searchParams.get('scope'),'identity read submit');
 assert.equal(url.searchParams.get('redirect_uri'),'https://d4d5d6.com/api/social/oauth/reddit/callback');
 assert.ok(url.searchParams.get('state'));assert.ok(!auth.url.includes(env.REDDIT_CLIENT_SECRET));
 await assert.rejects(completeSocialAuthorization('reddit',{code:'unused',state:buildSocialAuthorization('youtube',{...env,YOUTUBE_CLIENT_ID:'id',YOUTUBE_CLIENT_SECRET:'secret'}).url.split('state=')[1]?.split('&')[0]},env),/state|authenticat/i);
});

test('Reddit token exchange and refresh use Basic auth and URL-encoded bodies',async()=>{
 for (const grant of ['authorization_code','refresh_token']) {
 const token=await redditToken({grant_type:grant,[grant==='refresh_token'?'refresh_token':'code']:'secret-value'},env,async(url,options)=>{
 assert.equal(url,'https://www.reddit.com/api/v1/access_token');
 assert.equal(options.headers.Authorization,`Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
 assert.equal(options.headers['User-Agent'],env.REDDIT_USER_AGENT);assert.equal(options.body.get('grant_type'),grant);
 assert.equal(options.redirect,'error');return json({access_token:'new-access',token_type:'bearer',expires_in:3600});});
 assert.equal(token.access_token,'new-access');}
 await assert.rejects(redditToken({},env,async()=>json({access_token:'bad'})),/incomplète/);
 await assert.rejects(redditToken({},env,async()=>json({error:'invalid_grant',error_description:'secret-value'},400)),e=>e.status===400&&!e.message.includes('secret-value'));
});

test('Reddit identity rejects a different account and returns only public account identifiers',async()=>{
 const identity=await redditIdentity(env,async(url,options)=>{assert.equal(url,'https://oauth.reddit.com/api/v1/me');assert.equal(options.headers.Authorization,'Bearer test-access');return json({id:'abc',name:'hibou_test',inbox_count:100});});
 assert.deepEqual(identity,{technicalId:'abc',publicId:'hibou_test',profileUrl:'https://www.reddit.com/user/hibou_test/'});
 await assert.rejects(redditIdentity(env,async()=>json({id:'other',name:'someone_else'})),/ne correspond pas/);
});

test('Reddit text/link payloads use only configured subreddit and never silently repost',async()=>{
 for (const link of ['', 'https://d4d5d6.com']) {
 const result=await dispatchReddit({title:'Hibou test',caption:'Own text',metadata:{reddit_url:link,subreddit:'unapproved_target'}},env,async(url,options)=>{
 assert.equal(url,'https://oauth.reddit.com/api/submit');assert.equal(options.body.get('sr'),'hibou_test');
 assert.equal(options.body.get('kind'),link?'link':'self');assert.equal(options.body.get('resubmit'),'false');
 assert.equal(options.body.get(link?'url':'text'),link||'Own text');return json({json:{errors:[],data:{name:'t3_abc'}}});});
 assert.equal(result.post_id,'t3_abc');}
 await assert.rejects(dispatchReddit({title:'a'.repeat(301),caption:'text'},env,noFetch),/300/);
 await assert.rejects(dispatchReddit({title:'Test',caption:'text'},{...env,REDDIT_SUBREDDIT:''},noFetch),/SUBREDDIT absent/);
 await assert.rejects(dispatchReddit({title:'Test',metadata:{reddit_url:'https://secret:password@example.com'}},env,noFetch),/sans identifiants/);
 await assert.rejects(dispatchReddit({title:'Test',caption:'text'},env,async()=>json({json:{errors:[['RATELIMIT','wait']]}})),/publication refusée/);
});

test('Reddit dry run does not call remote services or require credentials',async()=>{
 const result=await dispatchSocialPost({provider:'reddit',title:'Test',caption:'Text'},{});
 assert.equal(result.dry_run,true);assert.equal(result.gateway.configured,false);
});

test('Reddit tokens round-trip only through the encrypted vault',()=>{
 const payload={env:{REDDIT_ACCESS_TOKEN:'not-public',REDDIT_REFRESH_TOKEN:'long-lived'}};
 const sealed=encryptSocialCredential('reddit','primary',payload,env);
 assert.ok(!JSON.stringify(sealed).includes('not-public'));
 assert.deepEqual(decryptSocialCredential({Provider:'reddit','Account key':'primary',Ciphertext:sealed.ciphertext,IV:sealed.iv,'Auth tag':sealed.authTag,'Vault version':sealed.version},env),payload);
});

test('Reddit control plane cannot report ready before external approval',()=>{
 const blocked={...env,REDDIT_API_APPROVED:'false'};
 const snapshot=buildSocialControlPlane({env:blocked,readiness:oauthProviderReadiness(blocked)});
 const reddit=snapshot.providers.find(x=>x.provider==='reddit');
 assert.equal(reddit.ready_for_human_approval,false);assert.equal(reddit.phase,'EXTERNAL_REDDIT_API_APPROVAL_REQUIRED');
 const ready=buildSocialControlPlane({env,readiness:oauthProviderReadiness(env)}).providers.find(x=>x.provider==='reddit');
 assert.equal(ready.ready_for_human_approval,true);assert.equal(ready.phase,'HUMAN_OAUTH_APPROVAL_REQUIRED');
});

test('Reddit OAuth persists encrypted tokens and refresh preserves the original refresh token',async(t)=>{
 const {resolveSocialEnv}=await import('../lib/social-credentials-runtime.mjs');
 let stored;let refresh=false;
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  const target=String(url);
  if(target==='https://www.reddit.com/api/v1/access_token'){
   assert.equal(options.body.get('grant_type'),refresh?'refresh_token':'authorization_code');
   return json({access_token:refresh?'refreshed-access':'initial-access',token_type:'bearer',expires_in:refresh?3600:1,scope:'identity read submit',...(refresh?{}:{refresh_token:'persistent-refresh'})});
  }
  if(target==='https://oauth.reddit.com/api/v1/me')return json({id:'abc',name:'hibou_test'});
  if(target.includes('/tblnSFykeeEKWNCv2')){
   if(options.method==='POST'){stored={id:'recTestReddit00001',fields:JSON.parse(options.body).records[0].fields};return json({records:[stored]});}
   if(options.method==='PATCH'){stored={...stored,fields:JSON.parse(options.body).fields};return json(stored);}
   return json({records:stored?[stored]:[]});
  }
  throw new Error(`Unexpected test URL ${target}`);
 });
 const previous=process.env.AIRTABLE_TOKEN;process.env.AIRTABLE_TOKEN='mock-airtable';
 try{
  const auth=buildSocialAuthorization('reddit',env);
  const result=await completeSocialAuthorization('reddit',{code:'single-use',state:new URL(auth.url).searchParams.get('state')},env);
  assert.ok(!JSON.stringify(result).includes('initial-access'));assert.ok(!JSON.stringify(stored).includes('persistent-refresh'));
  refresh=true;const resolved=await resolveSocialEnv('reddit',env);
  assert.equal(resolved.source,'encrypted_vault',resolved.vault_error);assert.equal(resolved.env.REDDIT_ACCESS_TOKEN,'refreshed-access');
  assert.equal(resolved.env.REDDIT_REFRESH_TOKEN,'persistent-refresh');
  assert.equal(resolved.env.REDDIT_API_APPROVED,'true');
 }finally{if(previous===undefined)delete process.env.AIRTABLE_TOKEN;else process.env.AIRTABLE_TOKEN=previous;}
});
