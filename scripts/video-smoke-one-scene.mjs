#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function parseArgs(argv){
  const args={scene:1,prepareOnly:false,runVoice:false,runImage:false};
  const positional=[];
  for(const item of argv){
    if(item==="--prepare-only") args.prepareOnly=true;
    else if(item==="--run-voice") args.runVoice=true;
    else if(item==="--run-image") args.runImage=true;
    else if(item.startsWith("--scene=")) args.scene=Number(item.split("=")[1]);
    else positional.push(item);
  }
  if(!Number.isInteger(args.scene)||args.scene<1) fail("--scene must be a positive integer");
  args.contract=positional[0];
  args.output=positional[1];
  args.binding=positional[2]||"";
  if(!args.contract||!args.output) fail("usage: video-smoke-one-scene.mjs storyboard.json output_dir [comfyui-binding.json] [--scene=N] [--prepare-only] [--run-voice] [--run-image]");
  return args;
}
function writeJson(path,value){ mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,JSON.stringify(value,null,2)); }
function run(command,args,env={}){
  const r=spawnSync(command,args,{stdio:"inherit",env:{...process.env,...env}});
  if(r.status!==0) fail(`${command} failed with status ${r.status}`);
}
export function buildOneSceneContract(contract,sceneNumber=1){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if(contract?.contract_state!=="storyboard") fail("smoke test requires storyboard contract");
  const scenes=contract.scenes||[];
  const source=scenes.find(s=>Number(s.order)===sceneNumber);
  if(!source) fail(`scene ${sceneNumber} not found`);
  const scene=structuredClone(source);
  scene.order=1;
  return {
    ...structuredClone(contract),
    smoke_test:{
      schema:"HIBOU_ONE_SCENE_SMOKE_V1",
      source_scene_order:sceneNumber,
      source_scene_id:source.scene_id,
      publication_authorized:false
    },
    scenes:[scene],
    validation:{...(contract.validation||{}),human_required:true,publication_authorized:false}
  };
}
export function prepareSmoke(contractPath,outputDir,sceneNumber=1){
  const source=resolve(contractPath);
  const out=resolve(outputDir);
  const contract=JSON.parse(readFileSync(source,"utf8"));
  const single=buildOneSceneContract(contract,sceneNumber);
  mkdirSync(out,{recursive:true});
  const storyboard=resolve(out,"storyboard-one-scene.json");
  writeJson(storyboard,single);
  const state={
    schema:"HIBOU_ONE_SCENE_SMOKE_PREP_V1",
    source_contract:source,
    source_name:basename(source),
    source_scene_order:sceneNumber,
    scene_id:single.scenes[0].scene_id,
    storyboard,
    voice_output_dir:resolve(out,"voice"),
    image_output_dir:resolve(out,"images"),
    publication_authorized:false
  };
  writeJson(resolve(out,"smoke-prep.json"),state);
  return state;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const args=parseArgs(process.argv.slice(2));
  const state=prepareSmoke(args.contract,args.output,args.scene);
  if(args.prepareOnly || (!args.runVoice&&!args.runImage)){
    process.stdout.write(JSON.stringify({ok:true,mode:"prepared",...state})+"\n");
    process.exit(0);
  }
  if(args.runVoice){
    const python=process.env.HIBOU_PYTHON || (process.platform==="win32" ? "py" : "python3.11");
    const pyArgs=process.platform==="win32" && python==="py"
      ? ["-3.11",resolve("scripts/chatterbox-storyboard-batch.py"),state.storyboard,state.voice_output_dir]
      : [resolve("scripts/chatterbox-storyboard-batch.py"),state.storyboard,state.voice_output_dir];
    run(python,pyArgs);
  }
  if(args.runImage){
    if(!args.binding) fail("comfyui-binding.json is required with --run-image");
    if(!existsSync(resolve(args.binding))) fail("ComfyUI binding file not found");
    const plan=resolve(state.image_output_dir,"image-plan.json");
    const manifest=resolve(state.image_output_dir,"batch-manifest.json");
    const selections=resolve(state.image_output_dir,"selections.template.json");
    run(process.execPath,[resolve("scripts/video-image-plan.mjs"),state.storyboard,resolve(args.binding),plan]);
    run(process.execPath,[resolve("scripts/video-image-batch.mjs"),plan,manifest,selections,"--max-scenes=1"]);
  }
  process.stdout.write(JSON.stringify({ok:true,mode:"executed",voice:Boolean(args.runVoice),image:Boolean(args.runImage),...state})+"\n");
}
