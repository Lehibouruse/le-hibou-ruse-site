import assert from "node:assert/strict";
import test from "node:test";
import { classify, parseNvidiaCsv } from "../scripts/video-local-preflight.mjs";

test("parseNvidiaCsv parses multiple GPUs", () => {
  assert.deepEqual(parseNvidiaCsv("0, NVIDIA RTX TEST, 24576, 22000, 999.1\n1, GPU B, 12288, 9000, 999.1"), [
    { index: 0, name: "NVIDIA RTX TEST", memory_total_mib: 24576, memory_free_mib: 22000, driver_version: "999.1" },
    { index: 1, name: "GPU B", memory_total_mib: 12288, memory_free_mib: 9000, driver_version: "999.1" },
  ]);
});

test("preflight fails closed before model download if no NVIDIA GPU", () => {
  const d = classify({
    gpus: [],
    python: { available: true },
    ffmpeg: { available: true },
    ffprobe: { available: true },
    disk_free_gib: 100,
  });
  assert.equal(d.ready_for_model_smoke_test, false);
  assert.equal(d.policy, "STOP_BEFORE_MODEL_DOWNLOAD");
  assert(d.blocking_reasons.includes("no_nvidia_gpu"));
});

test("preflight also blocks missing runtime or low disk", () => {
  const d = classify({
    gpus: [{ index: 0 }],
    python: { available: false },
    ffmpeg: { available: true },
    ffprobe: { available: false },
    disk_free_gib: 8,
  });
  assert.deepEqual(d.blocking_reasons, ["python_missing", "ffmpeg_missing", "low_disk_space"]);
});
