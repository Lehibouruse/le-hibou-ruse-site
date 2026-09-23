#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function hashObject(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function probe(path) {
  return JSON.parse(run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    path,
  ]));
}

function validVisual(path) {
  if (!existsSync(path)) return false;
  try {
    const data = probe(path);
    const video = data.streams.find(stream => stream.codec_type === "video");
    return video?.codec_name === "h264" && video?.width === 1080 && video?.height === 1920 && video?.r_frame_rate === "30/1";
  } catch {
    return false;
  }
}

export function validateVideoContract(contract, root) {
  for (const key of ["contract_version", "content", "engine", "scenes", "audio", "music", "subtitles", "qc", "validation"]) {
    if (!(key in contract)) fail(`missing ${key}`);
  }
  if (contract.contract_version !== "HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if ((contract.contract_state || "render_ready") === "storyboard") fail("storyboard contract is not render-ready; generate/select media first");
  if (contract.engine.width !== 1080 || contract.engine.height !== 1920 || contract.engine.fps !== 30) {
    fail("renderer requires 1080x1920@30");
  }

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

  return { audio, audioHash, total };
}

export function renderVideoContract(contractPathArg, outputArg) {
  const contractPath = resolve(contractPathArg);
  const root = dirname(contractPath);
  const output = resolve(outputArg);
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const { audio, audioHash, total } = validateVideoContract(contract, root);
  const preset = String(contract.engine?.preset || "medium");

  mkdirSync(dirname(output), { recursive: true });
  const work = resolve(root, ".video-render-cache");
  mkdirSync(work, { recursive: true });

  let sceneCacheHits = 0;
  let sceneCacheMisses = 0;
  const clips = [];
  const clipFingerprints = [];

  for (let i = 0; i < contract.scenes.length; i += 1) {
    const scene = contract.scenes[i];
    const image = resolve(root, scene.image.selected);
    const imageHash = sha256(image);
    const duration = Number(scene.planned_duration_s);
    const zoomPercent = Math.min(4, Math.max(2, Number(scene.zoom_percent ?? 3)));
    const maxZoom = 1 + zoomPercent / 100;
    const frames = Math.max(1, Math.round(duration * 30));
    const increment = (maxZoom - 1) / frames;

    const fingerprint = hashObject({
      contract_version: contract.contract_version,
      renderer: contract.engine.renderer,
      renderer_version: contract.engine.renderer_version,
      width: contract.engine.width,
      height: contract.engine.height,
      fps: contract.engine.fps,
      preset,
      image_sha256: imageHash,
      duration,
      zoom_percent: zoomPercent,
    });
    const clip = resolve(work, `scene-${String(i + 1).padStart(2, "0")}-${fingerprint.slice(0, 16)}.mp4`);

    if (validVisual(clip)) {
      sceneCacheHits += 1;
    } else {
      const vf = `scale=1200:2134:force_original_aspect_ratio=increase,crop=1200:2134,zoompan=z='if(eq(on,1),1.0,min(zoom+${increment.toFixed(8)},${maxZoom.toFixed(5)}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`;
      run("ffmpeg", [
        "-y", "-loglevel", "error", "-loop", "1", "-i", image,
        "-vf", vf, "-t", duration.toFixed(3), "-an",
        "-c:v", "libx264", "-preset", preset, "-crf", "18", "-pix_fmt", "yuv420p",
        clip,
      ]);
      sceneCacheMisses += 1;
    }

    const clipHash = sha256(clip);
    scene.render_artifact = {
      path: clip,
      sha256: clipHash,
      cache: validVisual(clip) && sceneCacheMisses === 0 ? "reused_or_first_scene" : "available",
    };
    clips.push(clip);
    clipFingerprints.push(clipHash);
  }

  const visualFingerprint = hashObject({ clips: clipFingerprints, fps: 30, width: 1080, height: 1920 });
  const concatPath = resolve(work, `scenes-${visualFingerprint.slice(0, 16)}.ffconcat`);
  writeFileSync(concatPath, `ffconcat version 1.0\n${clips.map(path => `file '${path.replaceAll("'", "'\\''")}'`).join("\n")}\n`);

  const visual = resolve(work, `visual-${visualFingerprint.slice(0, 16)}.mp4`);
  const visualCacheHit = validVisual(visual);
  if (!visualCacheHit) {
    run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", visual]);
  }

  run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", visual, "-i", audio,
    "-t", total.toFixed(3), "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-shortest", output,
  ]);

  const data = probe(output);
  const video = data.streams.find(stream => stream.codec_type === "video");
  const sound = data.streams.find(stream => stream.codec_type === "audio");
  const technical = {
    duration_s: Number(data.format.duration),
    size_bytes: Number(data.format.size),
    sha256: sha256(output),
    video_codec: video?.codec_name,
    width: video?.width,
    height: video?.height,
    fps: video?.r_frame_rate,
    audio_codec: sound?.codec_name,
    sample_rate: sound?.sample_rate,
    channels: sound?.channels,
    renderer_preset: preset,
    scene_cache_hits: sceneCacheHits,
    scene_cache_misses: sceneCacheMisses,
    visual_cache_hit: visualCacheHit,
    audio_sha256: audioHash,
  };

  contract.scenes.forEach(scene => { scene.measured_duration_s = scene.planned_duration_s; });
  contract.qc.technical = technical;
  contract.qc.status =
    technical.video_codec === "h264" &&
    technical.audio_codec === "aac" &&
    technical.width === 1080 &&
    technical.height === 1920 &&
    technical.fps === "30/1"
      ? "PASS"
      : "FAIL";
  writeFileSync(`${output}.manifest.json`, JSON.stringify(contract, null, 2));
  return technical;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [contractArg, outputArg] = process.argv.slice(2);
  if (!contractArg || !outputArg) fail("usage: node scripts/video-local-render.mjs contract.json output.mp4");
  process.stdout.write(`${JSON.stringify(renderVideoContract(contractArg, outputArg))}\n`);
}
