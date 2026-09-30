import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildServerAirtableSourceSnapshot } from "../scripts/video-airtable-source-snapshot.mjs";

const ID = (number) => `rec${String(number).padStart(14, "0")}`;

function records() {
  const scenes = Array.from({ length: 8 }, (_, index) => ({
    id: ID(index + 10),
    fields: { Ordre: index + 1, "Idée visuelle": `visual ${index + 1}` },
  }));
  const profile = { id: ID(2), fields: { Actif: true, Profil: "HIBOU_VIRAL_V1" } };
  const content = {
    id: ID(1),
    fields: {
      "Prompt / consignes": "Specific V2 brief",
      "Profil vidéo": [profile.id],
      "Scènes vidéo": scenes.map((scene) => scene.id),
    },
  };
  return { content, profile, scenes };
}

test("queue snapshot contains the exact source records in Airtable link order", () => {
  const { content, profile, scenes } = records();
  const capturedAt = "2026-09-30T19:50:00.000Z";
  const snapshot = buildServerAirtableSourceSnapshot(
    content, profile, [...scenes].reverse(), { capturedAt },
  );
  assert.equal(snapshot.schema, "HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1");
  assert.equal(snapshot.capture_method, "server_airtable_live");
  assert.equal(snapshot.captured_at, capturedAt);
  assert.equal(snapshot.expires_at, "2026-09-30T20:50:00.000Z");
  assert.deepEqual(snapshot.scenes.map((scene) => scene.id), scenes.map((scene) => scene.id));
  assert.equal(snapshot.content.fields["Prompt / consignes"], "Specific V2 brief");
  scenes[0].fields["Idée visuelle"] = "changed after capture";
  assert.equal(snapshot.scenes[0].fields["Idée visuelle"], "visual 1");
});

test("queue snapshot rejects mismatched source records", () => {
  const { content, profile, scenes } = records();
  assert.throws(() => buildServerAirtableSourceSnapshot(content, profile, scenes.slice(1)), /scene links invalid/);
  assert.throws(() => buildServerAirtableSourceSnapshot(content, { ...profile, id: ID(3) }, scenes), /profile link mismatch/);
  assert.throws(() => buildServerAirtableSourceSnapshot(content, profile, [...scenes.slice(0, 7), scenes[0]]), /duplicate scene/);
  assert.throws(() => buildServerAirtableSourceSnapshot(content, profile, scenes, { capturedAt: "bad" }), /capture time invalid/);
});

test("queue attaches a fresh receipt to the same records used for the storyboard", () => {
  const route = readFileSync(new URL("../app/api/local-worker-queue/route.js", import.meta.url), "utf8");
  assert.match(route, /job\.storyboard = buildStoryboardContract\(content, scenes, profile\);\s*job\.source_snapshot = buildServerAirtableSourceSnapshot\(content, profile, scenes\);/);
  assert.match(route, /source_snapshot_contract:\s*"HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1"/);
});
