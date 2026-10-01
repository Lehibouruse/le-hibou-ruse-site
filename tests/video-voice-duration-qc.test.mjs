import assert from "node:assert/strict";
import test from "node:test";
import {
  auditVoiceDurations,
  durationBounds,
  VOICE_DURATION_QC_SCHEMA,
} from "../scripts/video-voice-duration-qc.mjs";

test("duration bounds are speech-rate based but deliberately generous", () => {
  const b = durationBounds(
    "Le Hibou Rusé. Abonne-toi. Le guide est dans la bio.",
    150,
  );
  assert.ok(b.word_count >= 9);
  assert.ok(b.expected_duration_s > 3);
  assert.ok(b.max_duration_s > b.expected_duration_s * 2);
});

test("realistic short scene passes", () => {
  const report = auditVoiceDurations({
    schema: "HIBOU_CHATTERBOX_BATCH_V3",
    scenes: [{
      scene_id: "S01",
      text: "Pourquoi le prêt Lombard est une arnaque ?",
      voice_duration_s: 4.96,
      prosody_metadata_not_native: { target_wpm: 180 },
      cache: "miss",
    }],
  });
  assert.equal(report.schema, VOICE_DURATION_QC_SCHEMA);
  assert.equal(report.status, "PASS");
  assert.equal(report.rejected_scene_count, 0);
  assert.equal(report.publication_authorized, false);
});

test("27.9 second CTA is rejected as obviously implausible", () => {
  const report = auditVoiceDurations({
    schema: "HIBOU_CHATTERBOX_BATCH_V2",
    scenes: [{
      scene_id: "S13",
      text: "Le Hibou Rusé. Abonne-toi. Le guide est dans la bio.",
      voice_duration_s: 27.92,
      prosody_metadata_not_native: { target_wpm: 150 },
      cache: "miss",
    }],
  });
  assert.equal(report.status, "REJECT");
  assert.deepEqual(report.rejected_scene_ids, ["S13"]);
  assert.equal(
    report.scenes[0].reasons.includes(
      "duration_far_above_expected_speech_rate",
    ),
    true,
  );
  assert.ok(report.scenes[0].actual_to_expected_ratio > 4);
});

test("missing or zero duration is rejected", () => {
  for (const duration of [null, 0]) {
    const report = auditVoiceDurations({
      schema: "HIBOU_CHATTERBOX_BATCH_V3",
      scenes: [{
        scene_id: "S01",
        text: "Une phrase simple.",
        voice_duration_s: duration,
      }],
    });
    assert.equal(report.status, "REJECT");
  }
});

test("wrong manifest schema is rejected", () => {
  assert.throws(
    () => auditVoiceDurations({ schema: "OTHER", scenes: [] }),
    /HIBOU_CHATTERBOX_BATCH_V2\/V3 required/,
  );
});
