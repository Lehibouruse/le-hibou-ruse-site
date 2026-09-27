#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildSceneCompositePlan, sceneAssetRefs } from "./video-scene-compositor.mjs";

function fail(message) { throw new Error(message); }

function run(command, args, { env = {} } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) fail(`${command} failed: ${result.stderr?.slice(-4000) || result.stdout}`);
  return result.stdout;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashObject(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildSceneRenderFingerprint({contract, plan, assetHashes, duration, preset, crf}) {
  return hashObject({
    contract_version: contract.contract_version,
    renderer: contract.engine.renderer,
    renderer_version: contract.engine.renderer_version,
    width: contract.engine.width,
    height: contract.engine.height,
    fps: contract.engine.fps,
    preset,
    crf,
    composition: plan.normalized,
    timeline: plan.timeline,
    asset_sha256: assetHashes,
    duration,
  });
}

function probe(path) {
  return JSON.parse(run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    path,
  ]));
}

function ffmpegFilterPath(path) {
  return resolve(path).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildSubtitleFontRuntime({
  platform = process.platform,
  workDir = process.cwd(),
  windowsDir = process.env.WINDIR || "C:\\Windows",
} = {}) {
  if (platform !== "win32") {
    return {
      enabled: false,
      fonts_dir: null,
      fontconfig_dir: null,
      fontconfig_file: null,
      fontconfig_cache: null,
      fontconfig_xml: null,
      env: {},
    };
  }

  const fontconfigDir = resolve(workDir, "fontconfig");
  const fontconfigFile = resolve(fontconfigDir, "fonts.conf");
  const fontconfigCache = resolve(fontconfigDir, "cache");
  const fontsDir = resolve(windowsDir, "Fonts");
  const fontconfigXml =
    '<?xml version="1.0"?>\n' +
    "<fontconfig>\n" +
    `  <dir>${xmlEscape(fontsDir.replaceAll("\\", "/"))}</dir>\n` +
    `  <cachedir>${xmlEscape(fontconfigCache.replaceAll("\\", "/"))}</cachedir>\n` +
    "</fontconfig>\n";

  return {
    enabled: true,
    fonts_dir: fontsDir,
    fontconfig_dir: fontconfigDir,
    fontconfig_file: fontconfigFile,
    fontconfig_cache: fontconfigCache,
    fontconfig_xml: fontconfigXml,
    env: {
      FONTCONFIG_FILE: fontconfigFile,
      FONTCONFIG_PATH: fontconfigDir,
    },
  };
}

function ensureSubtitleFontRuntime(plan) {
  if (!plan?.enabled) return;
  mkdirSync(plan.fontconfig_dir, { recursive: true });
  mkdirSync(plan.fontconfig_cache, { recursive: true });
  writeFileSync(plan.fontconfig_file, plan.fontconfig_xml, "utf8");
}

function anchorExpressions(anchor) {
  const normalized = String(anchor || "center").toLowerCase();
  if (["left", "gauche"].includes(normalized)) return { x: "0", y: "ih/2-(ih/zoom/2)" };
  if (["right", "droite"].includes(normalized)) return { x: "iw-(iw/zoom)", y: "ih/2-(ih/zoom/2)" };
  return { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
}

export function renderEncodingPolicy(contract) {
  const mode = String(contract?.production?.mode || "final").trim().toLowerCase();
  if (!["preview", "final"].includes(mode)) fail("production.mode must be preview or final");
  const preset = mode === "preview"
    ? String(contract?.engine?.preview_preset || "veryfast")
    : String(contract?.engine?.preset || "medium");
  const requestedCrf = Number(mode === "preview"
    ? (contract?.engine?.preview_crf ?? 23)
    : (contract?.engine?.crf ?? 18));
  const min = mode === "preview" ? 18 : 14;
  const max = mode === "preview" ? 30 : 24;
  const crf = Math.round(Math.min(max, Math.max(min, Number.isFinite(requestedCrf) ? requestedCrf : (mode === "preview" ? 23 : 18))));
  return { production_mode: mode, preset, crf, preview_only: mode === "preview" };
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
    const assets = sceneAssetRefs(scene).map(ref => resolve(root, ref));
    for (const asset of assets) {
      if (!existsSync(asset)) fail(`scene asset missing: ${asset}`);
    }
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
  const encoding = renderEncodingPolicy(contract);
  const { production_mode: productionMode, preset, crf } = encoding;

  mkdirSync(dirname(output), { recursive: true });
  const work = resolve(root, ".video-render-cache");
  mkdirSync(work, { recursive: true });
  const subtitleFontRuntime = buildSubtitleFontRuntime({ workDir: work });
  ensureSubtitleFontRuntime(subtitleFontRuntime);

  let sceneCacheHits = 0;
  let sceneCacheMisses = 0;
  const clips = [];
  const clipFingerprints = [];

  for (let i = 0; i < contract.scenes.length; i += 1) {
    const scene = contract.scenes[i];
    const duration = Number(scene.planned_duration_s);
    const plan = buildSceneCompositePlan(scene, {
      duration,
      width: contract.engine.width,
      height: contract.engine.height,
      fps: contract.engine.fps,
    });
    const assetPaths = plan.input_refs.map(ref => resolve(root, ref));
    const assetHashes = assetPaths.map(path => sha256(path));

    const fingerprint = buildSceneRenderFingerprint({
      contract,
      plan,
      assetHashes,
      duration,
      preset,
      crf,
    });
    const clip = resolve(work, `scene-${String(i + 1).padStart(2, "0")}-${fingerprint.slice(0, 16)}.mp4`);
    const clipWasCached = validVisual(clip);

    if (clipWasCached) {
      sceneCacheHits += 1;
    } else {
      const args = ["-y", "-loglevel", "error"];
      for (const asset of assetPaths) args.push("-loop", "1", "-i", asset);
      args.push(
        "-filter_complex", plan.filter_complex,
        "-map", plan.output_label,
        "-t", duration.toFixed(3),
        "-an",
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", String(crf),
        "-pix_fmt", "yuv420p",
        clip,
      );
      run("ffmpeg", args);
      sceneCacheMisses += 1;
    }

    const clipHash = sha256(clip);
    scene.render_artifact = {
      path: clip,
      sha256: clipHash,
      cache: clipWasCached ? "hit" : "miss",
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

  let subtitlePath = null;
  if (contract.subtitles?.burn_in && contract.subtitles?.reference) {
    subtitlePath = resolve(root, contract.subtitles.reference);
    if (!existsSync(subtitlePath)) fail(`subtitles missing: ${subtitlePath}`);
    if (contract.subtitles.sha256 && sha256(subtitlePath) !== contract.subtitles.sha256) fail("subtitle sha256 mismatch");
  }

  const muxArgs = [
    "-y", "-loglevel", "error", "-i", visual, "-i", audio,
    "-t", total.toFixed(3), "-map", "0:v:0", "-map", "1:a:0",
  ];
  if (subtitlePath) {
    const assFilter = subtitleFontRuntime.enabled
      ? `ass='${ffmpegFilterPath(subtitlePath)}':fontsdir='${ffmpegFilterPath(subtitleFontRuntime.fonts_dir)}'`
      : `ass='${ffmpegFilterPath(subtitlePath)}'`;
    muxArgs.push("-vf", assFilter,
      "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p");
  } else {
    muxArgs.push("-c:v", "copy");
  }
  muxArgs.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-shortest", output);
  run("ffmpeg", muxArgs, { env: subtitleFontRuntime.env });

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
    production_mode: productionMode,
    preview_only: encoding.preview_only,
    renderer_preset: preset,
    renderer_crf: crf,
    scene_cache_hits: sceneCacheHits,
    scene_cache_misses: sceneCacheMisses,
    visual_cache_hit: visualCacheHit,
    audio_sha256: audioHash,
    subtitles_burned_in: Boolean(subtitlePath),
    subtitles_sha256: subtitlePath ? sha256(subtitlePath) : null,
    subtitle_font_runtime: subtitlePath
      ? {
          mode: subtitleFontRuntime.enabled ? "windows_private_fontconfig" : "system_default",
          fonts_dir: subtitleFontRuntime.fonts_dir,
          fontconfig_file: subtitleFontRuntime.fontconfig_file,
        }
      : null,
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
  contract.validation = {
    ...(contract.validation || {}),
    human_required: true,
    publication_authorized: false,
    production_mode: productionMode,
    preview_only: encoding.preview_only,
  };
  writeFileSync(`${output}.manifest.json`, JSON.stringify(contract, null, 2));
  return technical;
}

if (import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [contractArg, outputArg] = process.argv.slice(2);
  if (!contractArg || !outputArg) fail("usage: node scripts/video-local-render.mjs contract.json output.mp4");
  process.stdout.write(`${JSON.stringify(renderVideoContract(contractArg, outputArg))}\n`);
}
