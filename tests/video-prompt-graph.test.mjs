import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPromptGraph,
  PROMPT_GRAPH_SCHEMA,
} from "../scripts/video-prompt-graph.mjs";

function contract() {
  return {
    contract_version: "HIBOU_VIDEO_CONTRACT_V1",
    content: {
      content_id: "recCONTENT1234567",
      title: "Test Hibou",
      method_version: "VIDEO_METHOD_V4.3",
    },
    creative: {
      profile_name: "HIBOU_VIRAL_V1",
      content_brief: "Expliquer un mécanisme clairement.",
      style_lock: "illustration éditoriale premium cohérente",
      character_lock: "Hibou canonique au monocle doré",
      reference_mode: "deterministic_character_overlay",
      reference_asset_repo_path: "video/assets/hibou-canonical-512.webp.b64",
      negative_prompt: "no humans, no text, no identity drift",
      language: "fr",
      branding: {
        text: "Le Hibou Rusé",
        position: "bottom-center",
        size: "small",
        color: "ink",
        source: "post-production",
      },
      pacing: {
        perceptible_beat_s: [2, 3],
        full_composition_change_s: [3, 5],
      },
      production_defaults: {
        plans_min: 10,
        plans_max: 16,
      },
    },
    audio: { engine: "chatterbox_multilingual" },
    engine: { width: 1080, height: 1920, fps: 30 },
    production: { mode: "preview" },
    scenes: [
      {
        scene_id: "S01",
        order: 1,
        narration_exact: {
          mode: "text_reference",
          text: "Voici le problème.",
        },
        visual_idea: "Un coffre fermé devant le Hibou.",
        image_prompt: "Coffre illustré, décor financier sobre.",
        screen_text: "Le problème",
        framing: { hibou: true, type: "medium" },
        pose_request: "teacher",
        zoom_percent: 2,
        voice: {
          target_wpm: 188,
          relative_speed_pct: 102,
          pause_after_ms: 120,
          emphasis: "strong",
          intent: "hook",
          verbatim: true,
          prosody_cues: [],
        },
        timeline: {
          events: [
            { type: "caption", at_s: 0.4, end_s: 1.6, payload: { text: "Le problème" } },
            { type: "prop", at_s: 1.8, payload: { asset_id: "lock" } },
          ],
        },
      },
      {
        scene_id: "S02",
        order: 2,
        narration_exact: {
          mode: "text_reference",
          text: "Puis on révèle la règle.",
        },
        visual_idea: "Le coffre s'ouvre avec une clé.",
        screen_text: "La règle",
        framing: { hibou: true, type: "medium" },
        voice: { verbatim: true },
        timeline: { events: [] },
      },
    ],
  };
}

test("prompt graph preserves GLOBAL layers and makes every scene reference them", () => {
  const graph = buildPromptGraph(contract());
  assert.equal(graph.schema, PROMPT_GRAPH_SCHEMA);
  assert.equal(graph.scene_count, 2);
  const sceneNodes = graph.nodes.filter((node) => node.kind === "SCENE_PROMPT");
  assert.equal(sceneNodes.length, 2);
  for (const node of sceneNodes) {
    assert.deepEqual(node.references, [
      "GLOBAL_STYLE_BIBLE",
      "CHARACTER_BIBLE",
      "HEAD_IDENTITY_LOCK",
      "BRAND_FIELD",
      "NEGATIVE_CONSTRAINTS",
    ]);
  }
  const master = graph.nodes.find((node) => node.id === "MASTER_BRIEF");
  assert.equal(
    master.payload.global_layers.HEAD_IDENTITY_LOCK.reference_mode,
    "deterministic_character_overlay",
  );
  assert.equal(master.payload.global_layers.BRAND_FIELD.color, "ink");
});

test("attention beats remain independent from scene boundaries", () => {
  const graph = buildPromptGraph(contract());
  assert.equal(graph.scene_count, 2);
  assert.equal(graph.attention_beat_count, 2);
  const first = graph.nodes.find((node) => node.id === "SCENE_PROMPT[S01]");
  assert.equal(first.ATTENTION_BEATS.length, 2);
  assert.equal(first.ATTENTION_BEATS[0].beat_id, "S01-B01");
  assert.equal(
    graph.nodes.find((node) => node.id === "STORYBOARD_PROMPT")
      .payload.separation_policy,
    "semantic_scene_boundaries_are_independent_from_attention_beats",
  );
});

test("graph is deterministic and any scene delta changes its fingerprint", () => {
  const a = buildPromptGraph(contract());
  const b = buildPromptGraph(contract());
  assert.equal(a.prompt_graph_sha256, b.prompt_graph_sha256);

  const changed = contract();
  changed.scenes[0].image_prompt += " avec une balance dorée";
  const c = buildPromptGraph(changed);
  assert.notEqual(a.prompt_graph_sha256, c.prompt_graph_sha256);
});

test("graph is planning-only and cannot authorize publication or perform hidden model calls", () => {
  const graph = buildPromptGraph(contract());
  assert.equal(graph.policy.model_calls_performed, false);
  assert.equal(graph.policy.gpu_execution_performed, false);
  assert.equal(graph.policy.airtable_mutation_performed, false);
  assert.equal(graph.policy.publication_authorized, false);
  assert.equal(graph.policy.generated_image_text_allowed, false);
});

test("canonical identity and brand drift are rejected before scene prompt generation", () => {
  const badBrand = contract();
  badBrand.creative.branding.color = "sand";
  assert.throws(
    () => buildPromptGraph(badBrand),
    /BRAND_FIELD does not match/,
  );

  const badIdentity = contract();
  badIdentity.creative.reference_mode = "generative_character";
  assert.throws(
    () => buildPromptGraph(badIdentity),
    /HEAD_IDENTITY_LOCK requires deterministic_character_overlay/,
  );
});
