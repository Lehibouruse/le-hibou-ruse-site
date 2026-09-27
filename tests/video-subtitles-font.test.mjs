import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAss,
  defaultSubtitleFont,
} from "../scripts/video-subtitles.mjs";
import { attachSubtitles } from "../scripts/video-attach-subtitles.mjs";

const contract = {
  contract_version: "HIBOU_VIDEO_CONTRACT_V1",
  contract_state: "storyboard",
  scenes: [{
    scene_id: "S01",
    narration_text: "Le Hibou parle.",
    screen_text: "LE HIBOU",
    narration_exact: {
      mode: "audio_reference",
      start_s: 0,
      end_s: 2.5,
    },
  }],
};

test("subtitle font defaults to Arial on Windows and DejaVu Sans elsewhere", () => {
  assert.equal(defaultSubtitleFont("win32"), "Arial");
  assert.equal(defaultSubtitleFont("linux"), "DejaVu Sans");
  assert.equal(defaultSubtitleFont("darwin"), "DejaVu Sans");
});

test("ASS generation accepts the Windows-native font family", () => {
  const ass = buildAss(contract, { font: defaultSubtitleFont("win32") });
  assert.match(ass, /Style: Narration,Arial,54,/);
  assert.match(ass, /Style: ScreenText,Arial,48,/);
});

test("attached subtitle metadata records the actual ASS font family", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-sub-font-"));
  try {
    const contractPath = join(root, "contract.json");
    const assPath = join(root, "subtitles.ass");
    const outPath = join(root, "captioned.json");
    writeFileSync(contractPath, JSON.stringify(contract, null, 2));
    writeFileSync(
      assPath,
      buildAss(contract, { font: "Arial" }),
      "utf8",
    );

    attachSubtitles(contractPath, assPath, outPath);
    const out = JSON.parse(readFileSync(outPath, "utf8"));

    assert.equal(out.subtitles.font_family, "Arial");
    assert.equal(out.subtitles.burn_in, true);
    assert.equal(out.validation?.publication_authorized ?? false, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
