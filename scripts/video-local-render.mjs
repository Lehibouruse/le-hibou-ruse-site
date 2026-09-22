#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) { throw new Error(message); }
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) fail(`${command} failed: ${result.stderr?.slice(-4000) || result.stdout}`);
  return result.stdout;
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function validateVideoContract(contract, root) {
  for (const key of ["contract_version","content","engine","scenes","audio","music","subtitles","qc","validation"]) {
    if (!(key in contract)) fail(`missing ${key}`);
  }
  if (contract.contract_version !== "HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if (contract.engine.width !== 1080 || contract.engine.height !== 1920 || contract.engine.fps !== 30) fail("renderer requires 1080x1920@30");
  const audio = resolve(root, contract.audio.reference);
  if (!existsSync(audio)) fail(`audio missing: ${audio}`);
  const audioHash = sha256(audio);
  if (audioHash !== contract.audio.sha256) fail("audio sha256 mismatch");
  let total = 0;
  contract.scenes.forEach((scene, index) => {
    if (scene.order !== index + 1) fail("scene order must be contiguous");
    const image = resolve(root, scene.image.selected);
    if (!existsSync(image)) fail(`image missing: ${image}`);
    const ref = scene.narration_exact;
    const referencedDuration = Number(ref.end_s) - Number(ref.start_s);
    if (ref.mode !== "audio_reference" || ref.sha256 !== audioHash) fail(`narration ref mismatch: ${scene.scene_id}`);
    if (Math.abs(referencedDuration - Number(scene.planned_duration_s)) > 0.02) fail(`duration mismatch: ${scene.scene_id}`);
    total += Number(scene.planned_duration_s);
  });
  return { audio, total };
}
export function renderVideoContract(contractPathArg, outputArg) {
  const contractPath = resolve(contractPathArg);
  const root = dirname(contractPath);
  const output = resolve(outputArg);
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const { audio, total } = validateVideoContract(contract, root);
  mkdirSync(dirname(output), { recursive: true });
  const work = resolve(root, ".video-render-work");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const clips = [];
  for (let i = 0; i < contract.scenes.length; i += 1) {
    const scene = contract.scenes[i];
    const image = resolve(root, scene.image.selected);
    const duration = Number(scene.planned_duration_s);
    const zoomPercent = Math.min(4, Math.max(2, Number(scene.zoom_percent ?? 3)));
    const maxZoom = 1 + zoomPercent / 100;
    const frames = Math.max(1, Math.round(duration * 30));
    const increment = (maxZoom - 1) / frames;
    const clip = resolve(work, `scene-${String(i + 1).padStart(2,"0")}.mp4`);
    const vf = `scale=1200:2134:force_original_aspect_ratio=increase,crop=1200:2134,zoompan=z='if(eq(on,1),1.0,min(zoom+${increment.toFixed(8)},${maxZoom.toFixed(5)}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`;
    run("ffmpeg", ["-y","-loglevel","error","-loop","1","-i",image,"-vf",vf,"-t",duration.toFixed(3),"-an","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p",clip]);
    clips.push(clip);
  }
  const concatPath = resolve(work, "scenes.ffconcat");
  writeFileSync(concatPath, `ffconcat version 1.0\n${clips.map(path => `file '${path.replaceAll("'", "'\\''")}'`).join("\n")}\n`);
  const visual = resolve(work, "visual.mp4");
  run("ffmpeg", ["-y","-loglevel","error","-f","concat","-safe","0","-i",concatPath,"-c","copy",visual]);
  run("ffmpeg", ["-y","-loglevel","error","-i",visual,"-i",audio,"-t",total.toFixed(3),"-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","medium","-crf","20","-c:a","aac","-b:a","160k","-ar","48000","-ac","2","-pix_fmt","yuv420p","-movflags","+faststart","-shortest",output]);
  const probe = JSON.parse(run("ffprobe", ["-v","error","-show_entries","format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels","-of","json",output]));
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const sound = probe.streams.find(stream => stream.codec_type === "audio");
  const technical = {
    duration_s: Number(probe.format.duration), size_bytes: Number(probe.format.size), sha256: sha256(output),
    video_codec: video?.codec_name, width: video?.width, height: video?.height, fps: video?.r_frame_rate,
    audio_codec: sound?.codec_name, sample_rate: sound?.sample_rate, channels: sound?.channels,
  };
  contract.scenes.forEach(scene => { scene.measured_duration_s = scene.planned_duration_s; });
  contract.qc.technical = technical;
  contract.qc.status = technical.video_codec === "h264" && technical.audio_codec === "aac" && technical.width === 1080 && technical.height === 1920 && technical.fps === "30/1" ? "PASS" : "FAIL";
  writeFileSync(`${output}.manifest.json`, JSON.stringify(contract, null, 2));
  return technical;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [contractArg, outputArg] = process.argv.slice(2);
  if (!contractArg || !outputArg) fail("usage: node scripts/video-local-render.mjs contract.json output.mp4");
  process.stdout.write(`${JSON.stringify(renderVideoContract(contractArg, outputArg))}\n`);
}
