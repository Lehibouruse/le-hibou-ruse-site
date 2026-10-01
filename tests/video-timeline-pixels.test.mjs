import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildSceneCompositePlan} from '../scripts/video-scene-compositor.mjs';
import {applyWindowsDrawtextFont,buildSceneRenderFingerprint} from '../scripts/video-local-render.mjs';
const available=spawnSync('ffmpeg',['-version'],{windowsHide:true}).status===0;
function run(args){const r=spawnSync('ffmpeg',args,{windowsHide:true,maxBuffer:32*1024*1024,timeout:20000});assert.equal(r.status,0,String(r.stderr));return r.stdout;}
function fixture(t){const root=mkdtempSync(join(tmpdir(),'hibou-pixels-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function image(root,name,rgb){const path=join(root,name+'.ppm');writeFileSync(path,Buffer.concat([Buffer.from('P6\n64 64\n255\n'),Buffer.from(Array.from({length:4096},()=>rgb).flat())]));return path;}
function render(root,bg,events,duration=3){
 const scene={scene_id:'PIXELS',image:{selected:bg},zoom_percent:0,composition:{safe_zones:{left:0,right:0,top:0,bottom:0}},timeline:{events}};
 const plan=buildSceneCompositePlan(scene,{duration,width:360,height:640,fps:30});
 const out=join(root,'out.mp4'),args=['-y','-v','error','-filter_complex_threads','1'];
 for(const ref of plan.input_refs)args.push('-loop','1','-framerate','30','-i',ref);
 args.push('-filter_complex',applyWindowsDrawtextFont(plan.filter_complex),'-map',plan.output_label,'-t',String(duration),'-an','-c:v','libx264','-preset','ultrafast','-crf','14','-threads','1','-pix_fmt','yuv420p',out);
 run(args);return out;
}
function frame(out,time){return run(['-v','error','-ss',String(time),'-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);}
function red(raw){let n=0,x=0;for(let i=0;i<raw.length;i+=3)if(raw[i]>150&&raw[i+1]<90&&raw[i+2]<90){n++;x+=(i/3)%360;}return {n,x:n?x/n:null};}
test('actual FFmpeg pixels: delayed layer appears, moves and disappears',{skip:!available},t=>{
 const root=fixture(t),bg=image(root,'bg',[25,25,25]),prop=image(root,'prop',[240,20,20]);
 const out=render(root,bg,[{id:'move',type:'object',path:prop,width:80,anchor:'center',start_s:1,end_s:2,offset_x:-70,move_to_offset_x:70}]);
 const a=red(frame(out,.3)),b=red(frame(out,1.2)),c=red(frame(out,1.8)),d=red(frame(out,2.6));
 assert.equal(a.n,0);assert(b.n>500);assert(c.n>500);assert.equal(d.n,0);assert(c.x-b.x>60);
});
test('actual FFmpeg pixels: four ordered graphic states survive the final camera',{skip:!available},t=>{
 const root=fixture(t),bg=image(root,'bg',[25,25,25]),colors=[[240,20,20],[20,220,20],[20,20,235],[230,180,20]];
 const events=colors.map((rgb,i)=>({id:'state-'+i,type:'object',path:image(root,'state'+i,rgb),width:100,anchor:'center',start_s:i,end_s:i+1}));
 const out=render(root,bg,events,4);
 for(let i=0;i<4;i++){const raw=frame(out,i+.25),offset=(320*360+180)*3;for(let c=0;c<3;c++)assert(Math.abs(raw[offset+c]-colors[i][c])<30,'state '+i+', channel '+c);}
});
test('actual FFmpeg pixels: text including a percent sign appears only in its interval',{skip:!available},t=>{
 const root=fixture(t),bg=image(root,'bg',[25,25,25]);
 const out=render(root,bg,[{id:'label',type:'text',text:'MARGE +1 %',font_size:34,anchor:'center',start_s:1,end_s:2,box:false}]);
 const bright=raw=>{let n=0;for(let i=0;i<raw.length;i+=3)if(raw[i]>180&&raw[i+1]>180&&raw[i+2]>180)n++;return n;};
 assert.equal(bright(frame(out,.3)),0);assert(bright(frame(out,1.5))>100);assert.equal(bright(frame(out,2.6)),0);
});
test('zero camera amplitude remains zero and adjacent events use half-open windows',()=>{
 const plan=buildSceneCompositePlan({scene_id:'still',image:{selected:'bg.png'},zoom_percent:0,timeline:{events:[{id:'a',type:'text',text:'a',start_s:0,end_s:1},{id:'b',type:'text',text:'b',start_s:1,end_s:2}]}},{duration:2});
 assert.match(plan.filter_complex,/0\.00000000/);assert.match(plan.filter_complex,/1\.00000/);assert.doesNotMatch(plan.filter_complex,/1\.01500/);
 assert.match(plan.filter_complex,/gte\(t,0\.000\)\*lt\(t,1\.000\)/);
});
test('render cache is invalidated when the actual compositor filter changes',()=>{
 const contract={contract_version:'HIBOU_VIDEO_CONTRACT_V1',engine:{renderer:'ffmpeg',width:1080,height:1920,fps:30}};
 const plan={normalized:{background:'bg.png'},timeline:{events:[]},filter_complex:'old-filter'};
 const options={contract,plan,assetHashes:['a'.repeat(64)],duration:3,preset:'medium',crf:18};
 assert.notEqual(buildSceneRenderFingerprint(options),buildSceneRenderFingerprint({...options,plan:{...plan,filter_complex:'fixed-filter'}}));
});