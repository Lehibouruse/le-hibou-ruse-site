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
        color: "sand",
        source: "post-production",
      },
      pacing: {
        perceptible_beat_s: [1, 2],
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
        persona_case: "Paul, dirigeant de PME",
        condition: "La condition doit être remplie avant l'opération.",
        risk: "Risque d'abus si la chronologie est artificielle.",
        source_label: "CGI",
        jurisdiction: "FR",
        as_of_date: "2026-09-28",
        framing: { hibou: true, type: "medium" },
        pose_request: "explique",
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
          schema: "HIBOU_SCENE_TIMELINE_V1",
          events: [
            { id: "E01", type: "text", start_s: 0.4, end_s: 1.6, text: "Le problème" },
            { id: "E02", type: "object", start_s: 1.8, end_s: 3.0, reference: "lock" },
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
        timeline: { schema: "HIBOU_SCENE_TIMELINE_V1", events: [] },
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
  assert.equal(master.payload.global_layers.BRAND_FIELD.color, "sand");
});

test("attention beats use the current timeline window schema and stay independent from scenes", () => {
  const graph = buildPromptGraph(contract());
  assert.equal(graph.scene_count, 2);
  assert.equal(graph.attention_beat_count, 2);
  assert.deepEqual(graph.attention_beat_families, { caption: 1, prop: 1 });
  const first = graph.nodes.find((node) => node.id === "SCENE_PROMPT[S01]");
  assert.equal(first.ATTENTION_BEATS.length, 2);
  assert.equal(first.ATTENTION_BEATS[0].beat_id, "S01-B01");
  assert.equal(first.ATTENTION_BEATS[0].start_s, 0.4);
  assert.equal(first.ATTENTION_BEATS[0].end_s, 1.6);
  assert.equal(first.ATTENTION_BEATS[0].family, "caption");
  const storyboard = graph.nodes.find((node) => node.id === "STORYBOARD_PROMPT");
  assert.equal(
    storyboard.payload.separation_policy,
    "semantic_scene_boundaries_are_independent_from_attention_beats",
  );
  assert.match(storyboard.payload.beat_variation_policy, /same_family/);
});

test("editorial primitives are explicit scene deltas and never GLOBAL overrides", () => {
  const graph = buildPromptGraph(contract());
  const first = graph.nodes.find((node) => node.id === "SCENE_PROMPT[S01]");
  assert.deepEqual(first.SCENE_DELTA.editorial_primitives, {
    persona_case: "Paul, dirigeant de PME",
    condition: "La condition doit être remplie avant l'opération.",
    risk: "Risque d'abus si la chronologie est artificielle.",
    source_label: "CGI",
    jurisdiction: "FR",
    as_of_date: "2026-09-28",
  });
  assert.equal(first.references.includes("GLOBAL_STYLE_BIBLE"), true);
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

test("graph is planning-only and cannot authorize publication or perform hidden execution", () => {
  const graph = buildPromptGraph(contract());
  assert.equal(graph.policy.model_calls_performed, false);
  assert.equal(graph.policy.gpu_execution_performed, false);
  assert.equal(graph.policy.airtable_mutation_performed, false);
  assert.equal(graph.policy.render_execution_performed, false);
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

test("roadmap density/movement profiles require explicit selection and stay metadata-only", () => {
  const input = contract();
  input.audio.density_profile = "EXPLAINER_DENSE";
  input.creative.movement_profile = "HYBRID_BEATS";
  input.creative.curve_profile = "HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST";

  const graph = buildPromptGraph(input);
  const voice = graph.nodes.find((node) => node.id === "VOICE_SPEC");
  const edit = graph.nodes.find((node) => node.id === "EDIT_SPEC");

  assert.equal(voice.payload.density_profile, "EXPLAINER_DENSE");
  assert.equal(voice.payload.density_profile_runtime_applied, false);
  assert.equal(edit.payload.movement_profile, "HYBRID_BEATS");
  assert.equal(
    edit.payload.curve_profile,
    "HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST",
  );
  assert.equal(edit.payload.movement_profile_runtime_applied, false);
  assert.equal(edit.payload.curve_profile_runtime_applied, false);
  assert.equal(graph.policy.roadmap_profiles_require_e2e_before_runtime, true);
});

test("prompt graph does not silently invent density, movement or cadence profiles", () => {
  const graph = buildPromptGraph(contract());
  const voice = graph.nodes.find((node) => node.id === "VOICE_SPEC");
  const edit = graph.nodes.find((node) => node.id === "EDIT_SPEC");
  assert.equal(voice.payload.density_profile, null);
  assert.equal(edit.payload.movement_profile, null);
  assert.equal(edit.payload.curve_profile, null);
});

test("unsupported roadmap profiles fail closed rather than becoming hidden defaults", () => {
  const badVoice = contract();
  badVoice.audio.density_profile = "FASTEST_POSSIBLE";
  assert.throws(
    () => buildPromptGraph(badVoice),
    /VOICE_DENSITY_PROFILE must be one of/,
  );

  const badMovement = contract();
  badMovement.creative.movement_profile = "RANDOM_MOTION";
  assert.throws(
    () => buildPromptGraph(badMovement),
    /MOVEMENT_PROFILE must be one of/,
  );
});

test("canonical branding accepts the current sand field while still rejecting missing brand color",()=>{
  const current=contract();
  current.creative.branding.color="sand";
  const graph=buildPromptGraph(current);
  assert.equal(graph.nodes.find(n=>n.id==="MASTER_BRIEF").payload.global_layers.BRAND_FIELD.color,"sand");
  const bad=contract();
  bad.creative.branding.color="";
  assert.throws(()=>buildPromptGraph(bad),/BRAND_FIELD does not match/);
});
