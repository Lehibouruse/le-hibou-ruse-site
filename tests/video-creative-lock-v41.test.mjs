import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeSceneComposition } from "../scripts/video-scene-compositor.mjs";

const airtableSync = readFileSync(
  new URL("../scripts/video-airtable-sync.mjs", import.meta.url),
  "utf8",
);
const imagePlan = readFileSync(
  new URL("../scripts/video-image-plan.mjs", import.meta.url),
  "utf8",
);
const queueRoute = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("storyboard accepts slower editorial pacing and injects Airtable profile", () => {
  assert.match(airtableSync, /scene_count must be 8\.\.18/);
  assert.match(airtableSync, /duration must be 1\.5\.\.12 s/);
  assert.match(airtableSync, /Style lock/);
  assert.match(airtableSync, /Negative prompt/);
  assert.match(airtableSync, /Character lock Hibou/);
  assert.match(airtableSync, /Prompt \/ consignes/);
  assert.match(airtableSync, /VIDEO_METHOD_V4/);
});

test("queue passes video profile and preview production mode", () => {
  assert.match(queueRoute, /resolveCanonicalVideoProfile/);
  assert.match(queueRoute, /preview_mode/);
  assert.match(queueRoute, /candidates_per_scene/);
  assert.match(queueRoute, /full_master_allowed/);
});

test("image generation receives creative lock and never generates useful text", () => {
  assert.match(imagePlan, /TEXT_FREE_IMAGE_LOCK/);
  assert.match(imagePlan, /characterLock/);
  assert.match(imagePlan, /styleLock/);
  assert.match(imagePlan, /global_negative_policy_injected_as_literal_tokens:false/);
  assert.match(imagePlan, /zero readable lettering/);
  assert.match(imagePlan, /ENVIRONMENT_ONLY_COMPOSITION/);
  assert.match(imagePlan, /deterministic background prompt leaked character tokens/);
  assert.match(imagePlan, /OBJECTS_AND_ENVIRONMENT_COMPOSITION/);
});

test("brand signature is deterministic post-production sand text", () => {
  const scene = {
    scene_id: "test",
    image: { selected: "C:/tmp/background.png" },
    composition: {
      brand_signature: {
        text: "Le Hibou Rusé",
        anchor: "bottom-center",
        font_size: 28,
        font_color: "#C7A65A",
      },
    },
  };
  const normalized = normalizeSceneComposition(scene);
  const brand = normalized.text_layers.find((layer) => layer.kind === "brand_signature");
  assert.ok(brand);
  assert.equal(brand.text, "Le Hibou Rusé");
  assert.equal(brand.anchor, "bottom-center");
  assert.equal(brand.font_size, 28);
  assert.equal(brand.font_color, "#C7A65A");
  assert.equal(brand.box, false);
});


test("canonical owl asset is composited with background removal", () => {
  const source = readFileSync(
    new URL("../scripts/video-scene-compositor.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /remove_background/);
  assert.match(source, /colorkey=/);
  assert.match(source, /0xFBF6EE/);
});


test("canonical active profile is the fallback for every video", () => {
  assert.match(airtableSync, /resolveCanonicalVideoProfile/);
  assert.match(airtableSync, /AND\(\{Actif\}=1,\{Profil\}='HIBOU_VIRAL_V1'\)/);
  assert.match(airtableSync, /production_defaults/);
  assert.match(airtableSync, /Candidats par scène/);
  assert.match(airtableSync, /Seuil QC image/);
  assert.match(queueRoute, /resolveCanonicalVideoProfile/);
  assert.match(queueRoute, /defaultCandidates/);
  assert.match(queueRoute, /defaultMaxScenes/);
});
