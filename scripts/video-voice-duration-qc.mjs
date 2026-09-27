#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VOICE_DURATION_QC_SCHEMA = "HIBOU_VOICE_DURATION_QC_V1";

function fail(message) {
  throw new Error(message);
}

function words(text) {
  return String(text || "")
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu) || [];
}

export function durationBounds(text, targetWpm = 170) {
  const count = words(text).length;
  const wpm = Math.max(80, Math.min(240, Number(targetWpm) || 170));
  const expected = count > 0 ? (count * 60) / wpm : 0;
  return {
    word_count: count,
    target_wpm: wpm,
    expected_duration_s: expected,
    min_duration_s: Math.max(0.45, expected * 0.42),
    max_duration_s: Math.max(3.5, expected * 2.6 + 2.0),
  };
}

export function auditVoiceDurations(manifest) {
  if (!/^HIBOU_CHATTERBOX_BATCH_V[23]/.test(String(manifest?.schema || ""))) {
    fail("HIBOU_CHATTERBOX_BATCH_V2/V3 required");
  }

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (!scenes.length) fail("voice manifest scenes required");

  const rows = scenes.map((scene) => {
    const targetWpm = Number(
      scene?.prosody_metadata_not_native?.target_wpm ||
      scene?.target_wpm ||
      170,
    );
    const bounds = durationBounds(scene?.text, targetWpm);
    const actual = Number(scene?.voice_duration_s);
    const valid = Number.isFinite(actual) && actual > 0;
    const tooShort = valid && actual < bounds.min_duration_s;
    const tooLong = valid && actual > bounds.max_duration_s;
    const status = valid && !tooShort && !tooLong ? "PASS" : "REJECT";
    const ratio =
      valid && bounds.expected_duration_s > 0
        ? actual / bounds.expected_duration_s
        : null;

    const reasons = [];
    if (!valid) reasons.push("invalid_or_missing_duration");
    if (tooShort) reasons.push("duration_far_below_expected_speech_rate");
    if (tooLong) reasons.push("duration_far_above_expected_speech_rate");

    return {
      scene_id: String(scene?.scene_id || ""),
      text: String(scene?.text || ""),
      ...bounds,
      actual_duration_s: valid ? actual : null,
      actual_to_expected_ratio: ratio,
      status,
      reasons,
      cache: scene?.cache || null,
      duration_retry_applied: scene?.duration_retry_applied === true,
    };
  });

  const rejected = rows.filter((row) => row.status === "REJECT");
  return {
    schema: VOICE_DURATION_QC_SCHEMA,
    source_schema: manifest.schema,
    status: rejected.length ? "REJECT" : "PASS",
    scene_count: rows.length,
    rejected_scene_count: rejected.length,
    rejected_scene_ids: rejected.map((row) => row.scene_id),
    scenes: rows,
    thresholds: {
      target_wpm_clamped: [80, 240],
      min_formula: "max(0.45, expected*0.42)",
      max_formula: "max(3.5, expected*2.6+2.0)",
    },
    policy: {
      obvious_duration_anomalies_block_before_audio_master: true,
      single_scene_regeneration_should_be_preferred: true,
      paid_fallback: false,
      publication_authorized: false,
      human_review_required: true,
    },
    publication_authorized: false,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath) {
    fail(
      "usage: node scripts/video-voice-duration-qc.mjs voice-batch-manifest.json [voice-duration-qc.json]",
    );
  }
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  const report = auditVoiceDurations(manifest);
  if (outputPath) {
    writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2) + "\n");
  }
  process.stdout.write(
    JSON.stringify({
      ok: report.status === "PASS",
      schema: report.schema,
      status: report.status,
      rejected_scene_ids: report.rejected_scene_ids,
      publication_authorized: false,
    }) + "\n",
  );
  if (report.status !== "PASS") process.exitCode = 2;
}
