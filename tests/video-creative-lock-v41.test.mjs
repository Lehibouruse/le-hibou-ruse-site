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
  assert.match(airtableSync, /duration must be 2\.5\.\.5\.5 s/);
  assert.match(airtableSync, /Style lock/);
  assert.match(airtableSync, /Negative prompt/);
  assert.match(airtableSync, /Character lock Hibou/);
  assert.match(airtableSync, /Prompt \/ consignes/);
  assert.match(airtableSync, /VIDEO_METHOD_V4/);
});

test("queue passes video profile and preview production mode", () => {
  assert.match(queueRoute, /TABLES\.videoProfiles/);
  assert.match(queueRoute, /preview_mode/);
  assert.match(queueRoute, /candidates_per_scene/);
  assert.match(queueRoute, /full_master_allowed/);
});

test("image generation receives creative lock and never generates useful text", () => {
  assert.match(imagePlan, /TEXT_FREE_IMAGE_LOCK/);
  assert.match(imagePlan, /characterLock/);
  assert.match(imagePlan, /styleLock/);
  assert.match(imagePlan, /ABSOLUTELY AVOID/);
  assert.match(imagePlan, /The image itself must contain zero readable text/);
  assert.match(imagePlan, /BACKGROUND_ONLY_LOCK/);
  assert.match(imagePlan, /canonical Le Hibou Rusé character is composited later/);
});

test("brand signature is deterministic post-production ink text", () => {
  const scene = {
    scene_id: "test",
    image: { selected: "C:/tmp/background.png" },
    composition: {},
  };
  const normalized = normalizeSceneComposition(scene);
  const brand = normalized.text_layers.find((layer) => layer.kind === "brand_signature");
  assert.ok(brand);
  assert.equal(brand.text, "Le Hibou Rusé");
  assert.equal(brand.anchor, "bottom-center");
  assert.equal(brand.font_size, 28);
  assert.equal(brand.font_color, "#172331");
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
