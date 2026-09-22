import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { applyWorkflowOverrides, stableJobId, validateImageRequest, validateVoiceRequest } from "../scripts/video-local-adapters.mjs";

test("IMAGE_GEN refuse un endpoint ComfyUI distant", () => {
  assert.throws(() => validateImageRequest({
    interface: "IMAGE_GEN_V1", engine: "comfyui", content_id: "box", scene_id: "s01",
    endpoint: "https://example.com", workflow_path: "workflow.json", output_node_ids: ["9"],
  }), /loopback/);
});

test("IMAGE_GEN applique uniquement des overrides explicitement présents", () => {
  const graph = { "6": { inputs: { text: "old", seed: 1 } } };
  const next = applyWorkflowOverrides(graph, { "6": { text: "new", seed: 42 } });
  assert.equal(next["6"].inputs.text, "new");
  assert.equal(next["6"].inputs.seed, 42);
  assert.equal(graph["6"].inputs.text, "old");
  assert.throws(() => applyWorkflowOverrides(graph, { "7": { text: "x" } }), /node missing/);
});

test("VOICE_GEN expose seulement les paramètres Chatterbox natifs et garde la prosodie comme métadonnée", () => {
  const req = validateVoiceRequest({
    interface: "VOICE_GEN_V1", engine: "chatterbox_multilingual",
    content_id: "box", scene_id: "s01", text: "Bonjour.", language_id: "fr",
    exaggeration: 0.6, temperature: 0.8, cfg_weight: 0.4, seed: 12,
    prosody: { target_wpm: 210, pause_after_ms: 250, intent: "hook" },
  });
  assert.equal(req.exaggeration, 0.6);
  assert.equal(req.cfg_weight, 0.4);
  assert.equal(req.prosody.target_wpm, 210);
});

test("les identifiants de travail sont stables et sensibles aux entrées", () => {
  const base = { interface: "VOICE_GEN_V1", engine: "chatterbox_multilingual", content_id: "box", scene_id: "s01", text: "A", language_id: "fr" };
  assert.equal(stableJobId("VOICE_GEN", base), stableJobId("VOICE_GEN", { ...base }));
  assert.notEqual(stableJobId("VOICE_GEN", base), stableJobId("VOICE_GEN", { ...base, text: "B" }));
});


test("le wrapper Chatterbox est syntaxiquement valide sans charger le modèle", () => {
  const result = spawnSync("python3", ["-m", "py_compile", "scripts/chatterbox-local.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
