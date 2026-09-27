import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sync = readFileSync(new URL("../scripts/video-airtable-sync.mjs", import.meta.url), "utf8");
const master = readFileSync(new URL("../scripts/video-master.mjs", import.meta.url), "utf8");
const asset = readFileSync(new URL("../video/assets/hibou-canonical-512.webp.b64", import.meta.url), "utf8").trim();

test("canonical Hibou asset is embedded and commit-pinned", () => {
  assert.match(sync, /reference_asset_repo_path:"video\/assets\/hibou-canonical-512\.webp\.b64"/);
  assert.match(master, /raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site/);
  assert.match(master, /Buffer\.from\(encoded,"base64"\)/);
  assert.match(master, /reference is not a valid WebP payload/);
  assert.ok(asset.length > 10000);
  assert.match(asset, /^UklG/);
});

test("canonical Hibou runtime no longer depends on a default public site URL", () => {
  assert.match(sync, /HIBOU_REFERENCE_IMAGE_URL\|\|""/);
  assert.doesNotMatch(sync, /le-hibou-ruse-site\.vercel\.app\/hibou-monocle\.webp/);
});
