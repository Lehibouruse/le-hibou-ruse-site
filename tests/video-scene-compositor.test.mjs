import assert from "node:assert/strict";
import test from "node:test";
import { buildSceneCompositePlan, normalizeSceneComposition, sceneAssetRefs } from "../scripts/video-scene-compositor.mjs";

test("legacy single image remains a valid scene composition",()=>{
  const scene={scene_id:"S01",image:{selected:"images/s01.png"},zoom_percent:3,framing:{anchor:"center"}};
  const c=normalizeSceneComposition(scene);
  assert.equal(c.background,"images/s01.png");
  assert.deepEqual(c.layers,[]);
  assert.equal(c.transition,"hard-cut");
  assert.deepEqual(sceneAssetRefs(scene),["images/s01.png"]);
});

test("layered composition keeps assets independently replaceable and ordered by z",()=>{
  const scene={
    scene_id:"S02",
    image:{selected:"fallback.png"},
    composition:{
      background:"bg.webp",
      character_pose:{path:"owl.png",z:30,width:440,anchor:"bottom-right"},
      object_layers:[
        {path:"coin.png",z:20,width:180,anchor:"top-left"},
        {path:"chart.png",z:40,width:520,anchor:"center"}
      ],
      caption_layer:{text:"3 étapes",z:60},
      numeric_overlay:{text:"+27 %",z:70},
      camera_transform:{zoom_percent:2.5,anchor:"right"},
      safe_zones:{top:130,right:90,bottom:240,left:90}
    }
  };
  const c=normalizeSceneComposition(scene);
  assert.equal(c.background,"bg.webp");
  assert.deepEqual(c.layers.map(x=>x.ref),["coin.png","owl.png","chart.png"]);
  assert.deepEqual(sceneAssetRefs(scene),["bg.webp","coin.png","owl.png","chart.png"]);
  assert.equal(c.text_layers.length,2);
  assert.equal(c.camera_transform.zoom_percent,2.5);
});

test("ffmpeg plan composes transparent layers, text and camera transform before render",()=>{
  const scene={
    scene_id:"S03",
    composition:{
      background:"bg.png",
      character_pose:{path:"owl.webp",width:400,anchor:"bottom-center"},
      object_layers:[{path:"paper.png",width:260,anchor:"left"}],
      caption_layer:{text:"Le vrai coût"},
      numeric_overlay:{text:"1 200 €",anchor:"top-right"},
      camera_transform:{zoom_percent:2,anchor:"top-left"}
    }
  };
  const plan=buildSceneCompositePlan(scene,{duration:2.4,width:1080,height:1920,fps:30});
  assert.deepEqual(plan.input_refs,["bg.png","owl.webp","paper.png"]);
  assert.match(plan.filter_complex,/overlay=/);
  assert.match(plan.filter_complex,/drawtext=/);
  assert.match(plan.filter_complex,/zoompan=/);
  assert.match(plan.filter_complex,/s=1080x1920:fps=30/);
  assert.equal(plan.output_label,"[outv]");
});
