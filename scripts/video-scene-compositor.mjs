#!/usr/bin/env node

function fail(message){ throw new Error(message); }

function assetRef(value){
  if(!value) return "";
  if(typeof value==="string") return value;
  return String(value.path||value.reference||value.selected||"");
}

function num(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function safeText(value){
  return String(value??"")
    .replaceAll("\\","\\\\")
    .replaceAll(":","\\:")
    .replaceAll("'","\\'")
    .replaceAll("%","\\%");
}

function anchorParts(anchor){
  const raw=String(anchor||"center").toLowerCase().replaceAll("_","-");
  const x=raw.includes("left")?"left":raw.includes("right")?"right":"center";
  const y=raw.includes("top")?"top":raw.includes("bottom")?"bottom":"center";
  return {x,y};
}

function positionExpr(anchor,safe,offsetX=0,offsetY=0){
  const a=anchorParts(anchor);
  const left=num(safe?.left,80), right=num(safe?.right,80);
  const top=num(safe?.top,120), bottom=num(safe?.bottom,220);
  const x=a.x==="left"
    ? `${left}+${num(offsetX,0)}`
    : a.x==="right"
      ? `main_w-overlay_w-${right}+${num(offsetX,0)}`
      : `(main_w-overlay_w)/2+${num(offsetX,0)}`;
  const y=a.y==="top"
    ? `${top}+${num(offsetY,0)}`
    : a.y==="bottom"
      ? `main_h-overlay_h-${bottom}+${num(offsetY,0)}`
      : `(main_h-overlay_h)/2+${num(offsetY,0)}`;
  return {x,y};
}

function normalizeImageLayer(layer,kind,defaults={}){
  if(!layer) return null;
  const ref=assetRef(layer);
  if(!ref) return null;
  return {
    kind,
    ref,
    z:num(layer.z,defaults.z??10),
    width:Math.max(32,Math.round(num(layer.width,defaults.width??320))),
    anchor:String(layer.anchor||defaults.anchor||"center"),
    offset_x:num(layer.offset_x,0),
    offset_y:num(layer.offset_y,0),
    opacity:Math.min(1,Math.max(0,num(layer.opacity,1))),
    fade_ms:Math.max(0,Math.min(250,num(layer.fade_ms,defaults.fade_ms??80))),
    remove_background:Boolean(layer.remove_background??defaults.remove_background??false),
    chroma_key_color:String(layer.chroma_key_color||defaults.chroma_key_color||"0xFBF6EE"),
    chroma_key_similarity:Math.min(1,Math.max(0,num(layer.chroma_key_similarity,defaults.chroma_key_similarity??0.11))),
    chroma_key_blend:Math.min(1,Math.max(0,num(layer.chroma_key_blend,defaults.chroma_key_blend??0.07))),
  };
}

function normalizeTextLayer(layer,kind,defaults={}){
  if(!layer||!layer.text) return null;
  return {
    kind,
    text:String(layer.text),
    z:num(layer.z,defaults.z??50),
    anchor:String(layer.anchor||defaults.anchor||"bottom-center"),
    offset_x:num(layer.offset_x,0),
    offset_y:num(layer.offset_y,0),
    font_size:Math.max(18,Math.round(num(layer.font_size,defaults.font_size??58))),
    font_color:String(layer.font_color||defaults.font_color||"white"),
    border_width:Math.max(0,Math.round(num(layer.border_width,defaults.border_width??3))),
    border_color:String(layer.border_color||defaults.border_color||"black@0.9"),
    box:Boolean(layer.box??defaults.box??true),
    box_color:String(layer.box_color||defaults.box_color||"black@0.5"),
    box_border_width:Math.max(0,Math.round(num(layer.box_border_width,defaults.box_border_width??18))),
  };
}

function timelineWindow(event,duration){
  const start=Math.max(0,num(event?.start_s,0));
  const rawEnd=event?.end_s==null?duration:num(event.end_s,duration);
  const end=Math.min(duration,Math.max(start,rawEnd));
  if(!(end>start)) fail(`timeline event ${event?.id||event?.type||"?"}: end_s must be > start_s`);
  return {start_s:start,end_s:end};
}

function timelineEnable({start_s,end_s}){
  return `between(t,${start_s.toFixed(3)},${end_s.toFixed(3)})`;
}

export function normalizeSceneTimeline(scene,{duration}={}){
  const d=Number(duration??scene?.planned_duration_s??scene?.measured_duration_s);
  if(!Number.isFinite(d)||d<=0) return {schema:"HIBOU_SCENE_TIMELINE_V1",events:[]};
  const raw=Array.isArray(scene?.timeline?.events)?scene.timeline.events:[];
  const allowed=new Set(["text","callout","object","pose","camera","accent"]);
  const events=raw.map((event,index)=>{
    const type=String(event?.type||"").trim().toLowerCase();
    if(!allowed.has(type)) fail(`timeline event ${event?.id||index+1}: unsupported type ${type}`);
    const window=timelineWindow(event,d);
    const base={
      id:String(event?.id||`E${String(index+1).padStart(2,"0")}`),
      type,
      start_s:window.start_s,
      end_s:window.end_s,
      z:num(event?.z,type==="text"||type==="callout"?75:35),
      accent:String(event?.accent||""),
    };
    if(type==="text"||type==="callout"){
      if(!String(event?.text||"").trim()) fail(`timeline event ${base.id}: text required`);
      return {...base,text:String(event.text),style:normalizeTextLayer({...event,text:event.text},type==="callout"?"timeline_callout":"timeline_text",{
        z:base.z,font_size:type==="callout"?92:58,anchor:type==="callout"?"top-center":"bottom-center",box:type!=="callout"
      })};
    }
    if(type==="object"||type==="pose"){
      const layer=normalizeImageLayer(event,type==="pose"?"timeline_pose":"timeline_object",{
        z:base.z,width:type==="pose"?430:300,anchor:type==="pose"?"bottom-center":"center"
      });
      if(!layer) fail(`timeline event ${base.id}: asset path/reference required`);
      return {
        ...base,
        layer,
        motion:{
          to_offset_x:num(event?.move_to_offset_x,layer.offset_x),
          to_offset_y:num(event?.move_to_offset_y,layer.offset_y)
        }
      };
    }
    if(type==="camera"){
      return {...base,zoom_percent:Math.min(8,Math.max(0,num(event?.zoom_percent,0))),anchor:String(event?.anchor||"center")};
    }
    if(type==="accent"){
      return {
        ...base,
        accent:String(event?.accent||"gold_border"),
        color:String(event?.color||"0xC7A65A@0.75"),
        thickness:Math.max(2,Math.min(24,Math.round(num(event?.thickness,8)))),
        margin:Math.max(0,Math.min(120,Math.round(num(event?.margin,28))))
      };
    }
    return {...base};
  }).sort((a,b)=>a.start_s-b.start_s||a.z-b.z);
  return {schema:"HIBOU_SCENE_TIMELINE_V1",events};
}

export function normalizeSceneComposition(scene){
  const c=scene?.composition||{};
  const background=assetRef(c.background)||assetRef(scene?.image?.selected);
  if(!background) fail(`scene ${scene?.scene_id||scene?.order||"?"}: no background/image selected`);

  const layers=[];
  const character=normalizeImageLayer(c.character_pose,"character_pose",{z:20,width:430,anchor:"bottom-center"});
  if(character) layers.push(character);
  for(const item of Array.isArray(c.object_layers)?c.object_layers:[]){
    const layer=normalizeImageLayer(item,"object",{z:30,width:300,anchor:"center"});
    if(layer) layers.push(layer);
  }
  const captionImage=normalizeImageLayer(c.caption_layer,"caption_image",{z:60,width:900,anchor:"bottom-center",fade_ms:40});
  if(captionImage) layers.push(captionImage);
  const numericImage=normalizeImageLayer(c.numeric_overlay,"numeric_image",{z:70,width:420,anchor:"top-center",fade_ms:40});
  if(numericImage) layers.push(numericImage);

  const textLayers=[];
  if(!captionImage){
    const caption=normalizeTextLayer(c.caption_layer,"caption_text",{z:60,font_size:58,anchor:"bottom-center",box:true});
    if(caption) textLayers.push(caption);
  }
  if(!numericImage){
    const numeric=normalizeTextLayer(c.numeric_overlay,"numeric_text",{z:70,font_size:92,anchor:"top-center",box:false,border_width:4});
    if(numeric) textLayers.push(numeric);
  }

  // Canonical brand signature is deterministic post-production text
  // and is enabled explicitly by the production contract.
  if(c.brand_signature){
    const brand=normalizeTextLayer({
      text:String(c.brand_signature.text||"Le Hibou Rusé"),
      z:Number(c.brand_signature.z||95),
      anchor:String(c.brand_signature.anchor||"bottom-center"),
      offset_y:Number(c.brand_signature.offset_y??150),
      font_size:Number(c.brand_signature.font_size||28),
      font_color:String(c.brand_signature.font_color||"#172331"),
      border_width:0,
      box:false
    },"brand_signature",{z:95,font_size:28,anchor:"bottom-center",box:false,border_width:0});
    if(brand) textLayers.push(brand);
  }

  const camera=c.camera_transform||{};
  const zoomPercent=Math.min(4,Math.max(0,num(camera.zoom_percent,scene?.zoom_percent??3)));
  const cameraAnchor=String(camera.anchor||scene?.framing?.anchor||scene?.anchor||"center");
  const safeZones={
    top:num(c.safe_zones?.top,120),
    right:num(c.safe_zones?.right,80),
    bottom:num(c.safe_zones?.bottom,220),
    left:num(c.safe_zones?.left,80),
  };
  return {
    schema:"HIBOU_SCENE_COMPOSITION_V1",
    background,
    layers:layers.sort((a,b)=>a.z-b.z),
    text_layers:textLayers.sort((a,b)=>a.z-b.z),
    safe_zones:safeZones,
    camera_transform:{zoom_percent:zoomPercent,anchor:cameraAnchor},
    transition:String(c.transition||"hard-cut"),
  };
}

export function sceneAssetRefs(scene){
  const c=normalizeSceneComposition(scene);
  const duration=num(scene?.measured_duration_s,scene?.planned_duration_s);
  const timeline=normalizeSceneTimeline(scene,{duration});
  const timedAssets=timeline.events.filter(x=>x.layer?.ref).map(x=>x.layer.ref);
  return [c.background,...c.layers.map(x=>x.ref),...timedAssets];
}

function zoomAnchorExpressions(anchor){
  const a=anchorParts(anchor);
  const x=a.x==="left"?"0":a.x==="right"?"iw-(iw/zoom)":"iw/2-(iw/zoom/2)";
  const y=a.y==="top"?"0":a.y==="bottom"?"ih-(ih/zoom)":"ih/2-(ih/zoom/2)";
  return {x,y};
}

function drawtextPosition(anchor,safe,offsetX=0,offsetY=0){
  const a=anchorParts(anchor);
  const x=a.x==="left"
    ? `${num(safe.left,80)}+${num(offsetX,0)}`
    : a.x==="right"
      ? `w-text_w-${num(safe.right,80)}+${num(offsetX,0)}`
      : `(w-text_w)/2+${num(offsetX,0)}`;
  const y=a.y==="top"
    ? `${num(safe.top,120)}+${num(offsetY,0)}`
    : a.y==="bottom"
      ? `h-text_h-${num(safe.bottom,220)}+${num(offsetY,0)}`
      : `(h-text_h)/2+${num(offsetY,0)}`;
  return {x,y};
}

export function buildSceneCompositePlan(scene,{duration,width=1080,height=1920,fps=30}={}){
  const d=Number(duration);
  if(!Number.isFinite(d)||d<=0) fail("duration must be positive");
  const c=normalizeSceneComposition(scene);
  const filters=[];
  filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgba[base0]`);
  let base="base0";
  c.layers.forEach((layer,index)=>{
    const input=index+1;
    const overlay=`ov${index}`;
    const next=`base${index+1}`;
    const fade=Math.min(d/2,layer.fade_ms/1000);
    const fadeOutStart=Math.max(0,d-fade);
    const opacity=layer.opacity<1?`,colorchannelmixer=aa=${layer.opacity.toFixed(3)}`:"";
    const keyFilter=layer.remove_background
      ? `,colorkey=${layer.chroma_key_color}:${layer.chroma_key_similarity.toFixed(3)}:${layer.chroma_key_blend.toFixed(3)}`
      :"";
    const fadeFilter=fade>0
      ? `,fade=t=in:st=0:d=${fade.toFixed(3)}:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fade.toFixed(3)}:alpha=1`
      :"";
    filters.push(`[${input}:v]scale=${layer.width}:-2,format=rgba${keyFilter}${opacity}${fadeFilter}[${overlay}]`);
    const p=positionExpr(layer.anchor,c.safe_zones,layer.offset_x,layer.offset_y);
    filters.push(`[${base}][${overlay}]overlay=x='${p.x}':y='${p.y}':format=auto[${next}]`);
    base=next;
  });

  const timeline=normalizeSceneTimeline(scene,{duration:d});
  const timedImageEvents=timeline.events.filter(event=>event.layer?.ref);
  timedImageEvents.forEach((event,index)=>{
    const input=1+c.layers.length+index;
    const overlay=`tov${index}`;
    const next=`tbase${index}`;
    const layer=event.layer;
    const opacity=layer.opacity<1?`,colorchannelmixer=aa=${layer.opacity.toFixed(3)}`:"";
    const keyFilter=layer.remove_background
      ? `,colorkey=${layer.chroma_key_color}:${layer.chroma_key_similarity.toFixed(3)}:${layer.chroma_key_blend.toFixed(3)}`
      :"";
    filters.push(`[${input}:v]scale=${layer.width}:-2,format=rgba${keyFilter}${opacity}[${overlay}]`);
    const p=positionExpr(layer.anchor,c.safe_zones,layer.offset_x,layer.offset_y);
    const span=Math.max(0.001,event.end_s-event.start_s);
    const dx=num(event.motion?.to_offset_x,layer.offset_x)-layer.offset_x;
    const dy=num(event.motion?.to_offset_y,layer.offset_y)-layer.offset_y;
    const motion=(baseExpr,delta)=>Math.abs(delta)<0.001
      ?baseExpr
      :`(${baseExpr})+((t-${event.start_s.toFixed(3)})/${span.toFixed(3)})*${delta.toFixed(3)}`;
    filters.push(`[${base}][${overlay}]overlay=x='${motion(p.x,dx)}':y='${motion(p.y,dy)}':enable='${timelineEnable(event)}':format=auto[${next}]`);
    base=next;
  });

  c.text_layers.forEach((layer,index)=>{
    const next=`text${index}`;
    const p=drawtextPosition(layer.anchor,c.safe_zones,layer.offset_x,layer.offset_y);
    const opts=[
      `text='${safeText(layer.text)}'`,
      `fontsize=${layer.font_size}`,
      `fontcolor=${layer.font_color}`,
      `borderw=${layer.border_width}`,
      `bordercolor=${layer.border_color}`,
      `x='${p.x}'`,
      `y='${p.y}'`,
    ];
    if(layer.box){
      opts.push("box=1",`boxcolor=${layer.box_color}`,`boxborderw=${layer.box_border_width}`);
    }
    filters.push(`[${base}]drawtext=${opts.join(":")}[${next}]`);
    base=next;
  });

  const timedTextEvents=timeline.events.filter(event=>event.style);
  timedTextEvents.forEach((event,index)=>{
    const layer=event.style;
    const next=`ttext${index}`;
    const p=drawtextPosition(layer.anchor,c.safe_zones,layer.offset_x,layer.offset_y);
    const opts=[
      `text='${safeText(layer.text)}'`,
      `fontsize=${layer.font_size}`,
      `fontcolor=${layer.font_color}`,
      `borderw=${layer.border_width}`,
      `bordercolor=${layer.border_color}`,
      `x='${p.x}'`,
      `y='${p.y}'`,
      `enable='${timelineEnable(event)}'`,
    ];
    if(layer.box) opts.push("box=1",`boxcolor=${layer.box_color}`,`boxborderw=${layer.box_border_width}`);
    filters.push(`[${base}]drawtext=${opts.join(":")}[${next}]`);
    base=next;
  });

  const accentEvents=timeline.events.filter(event=>event.type==="accent");
  accentEvents.forEach((event,index)=>{
    const next=`accent${index}`;
    const m=event.margin;
    filters.push(
      `[${base}]drawbox=x=${m}:y=${m}:w=w-${m*2}:h=h-${m*2}:color=${event.color}:t=${event.thickness}:enable='${timelineEnable(event)}'[${next}]`
    );
    base=next;
  });

  const frames=Math.max(1,Math.round(d*fps));
  const zoomPercent=c.camera_transform.zoom_percent;
  const maxZoom=1+zoomPercent/100;
  const increment=(maxZoom-1)/frames;
  const pan=zoomAnchorExpressions(c.camera_transform.anchor);
  let zoomExpr=`if(eq(on,1),1.0,min(zoom+${increment.toFixed(8)},${maxZoom.toFixed(5)}))`;
  let panX=pan.x, panY=pan.y;
  for(const event of timeline.events.filter(x=>x.type==="camera")){
    const startFrame=Math.max(1,Math.round(event.start_s*fps)+1);
    const endFrame=Math.max(startFrame,Math.round(event.end_s*fps));
    const eventZoom=(1+event.zoom_percent/100).toFixed(5);
    const eventPan=zoomAnchorExpressions(event.anchor);
    zoomExpr=`if(between(on,${startFrame},${endFrame}),${eventZoom},${zoomExpr})`;
    panX=`if(between(on,${startFrame},${endFrame}),${eventPan.x},${panX})`;
    panY=`if(between(on,${startFrame},${endFrame}),${eventPan.y},${panY})`;
  }
  filters.push(
    `[${base}]zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p[outv]`
  );

  return {
    schema:"HIBOU_SCENE_COMPOSITOR_PLAN_V1",
    input_refs:[c.background,...c.layers.map(x=>x.ref),...timedImageEvents.map(x=>x.layer.ref)],
    filter_complex:filters.join(";"),
    output_label:"[outv]",
    normalized:c,
    timeline,
  };
}
