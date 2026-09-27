#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROMPT_GRAPH_SCHEMA = "HIBOU_VIDEO_PROMPT_GRAPH_V1";
export const PROMPT_GRAPH_VERSION = "PROMPT_GRAPH_V1";

function fail(message) {
  throw new Error(message);
}

function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function nonEmpty(value) {
  return String(value ?? "").trim();
}

function sceneNarration(scene) {
  return nonEmpty(scene?.narration_exact?.text);
}

function canonicalGlobalLayer(contract) {
  const creative = contract?.creative || {};
  const branding = creative?.branding || {};

  const global = {
    GLOBAL_STYLE_BIBLE: nonEmpty(creative.style_lock),
    CHARACTER_BIBLE: nonEmpty(creative.character_lock),
    HEAD_IDENTITY_LOCK: {
      reference_mode: nonEmpty(creative.reference_mode),
      reference_asset_repo_path: nonEmpty(creative.reference_asset_repo_path),
    },
    BRAND_FIELD: {
      text: nonEmpty(branding.text),
      position: nonEmpty(branding.position),
      size: nonEmpty(branding.size),
      color: nonEmpty(branding.color),
      source: nonEmpty(branding.source),
    },
    NEGATIVE_CONSTRAINTS: nonEmpty(creative.negative_prompt),
  };

  if (!global.GLOBAL_STYLE_BIBLE) fail("GLOBAL_STYLE_BIBLE missing");
  if (!global.CHARACTER_BIBLE) fail("CHARACTER_BIBLE missing");
  if (
    global.HEAD_IDENTITY_LOCK.reference_mode !==
    "deterministic_character_overlay"
  ) {
    fail("HEAD_IDENTITY_LOCK requires deterministic_character_overlay");
  }
  if (!global.HEAD_IDENTITY_LOCK.reference_asset_repo_path) {
    fail("HEAD_IDENTITY_LOCK canonical reference asset missing");
  }
  if (
    global.BRAND_FIELD.text !== "Le Hibou Rusé" ||
    global.BRAND_FIELD.position !== "bottom-center" ||
    global.BRAND_FIELD.size !== "small" ||
    global.BRAND_FIELD.color !== "ink" ||
    global.BRAND_FIELD.source !== "post-production"
  ) {
    fail("BRAND_FIELD does not match the canonical Hibou branding contract");
  }
  if (!global.NEGATIVE_CONSTRAINTS) fail("NEGATIVE_CONSTRAINTS missing");

  return global;
}

function timelineBeats(scene) {
  const events = Array.isArray(scene?.timeline?.events)
    ? scene.timeline.events
    : [];
  return events.map((event, index) => ({
    beat_id: `${scene.scene_id}-B${String(index + 1).padStart(2, "0")}`,
    type: nonEmpty(event?.type) || "attention_event",
    at_s: Number.isFinite(Number(event?.at_s))
      ? Number(event.at_s)
      : null,
    end_s: Number.isFinite(Number(event?.end_s))
      ? Number(event.end_s)
      : null,
    semantic_payload: event?.payload ?? null,
  }));
}

function sceneNode(scene, index) {
  const sceneId = nonEmpty(scene?.scene_id);
  if (!sceneId) fail(`scene ${index + 1}: scene_id missing`);

  const visual = nonEmpty(scene?.image_prompt) || nonEmpty(scene?.visual_idea);
  if (!visual) fail(`${sceneId}: SCENE_DELTA missing image prompt/visual idea`);

  const narration = sceneNarration(scene);
  if (!narration) fail(`${sceneId}: narration missing`);

  return {
    id: `SCENE_PROMPT[${sceneId}]`,
    kind: "SCENE_PROMPT",
    depends_on: ["STORYBOARD_PROMPT"],
    references: [
      "GLOBAL_STYLE_BIBLE",
      "CHARACTER_BIBLE",
      "HEAD_IDENTITY_LOCK",
      "BRAND_FIELD",
      "NEGATIVE_CONSTRAINTS",
    ],
    SCENE_DELTA: {
      scene_id: sceneId,
      order: Number(scene.order || index + 1),
      visual_idea: nonEmpty(scene.visual_idea),
      image_prompt: nonEmpty(scene.image_prompt),
      framing: scene.framing || null,
      pose_request: nonEmpty(scene.pose_request),
      zoom_percent: Number.isFinite(Number(scene.zoom_percent))
        ? Number(scene.zoom_percent)
        : null,
      screen_text: nonEmpty(scene.screen_text),
      narration_sha256: sha256Text(narration),
    },
    ATTENTION_BEATS: timelineBeats(scene),
  };
}

export function buildPromptGraph(contract) {
  if (contract?.contract_version !== "HIBOU_VIDEO_CONTRACT_V1") {
    fail("HIBOU_VIDEO_CONTRACT_V1 required");
  }

  const scenes = Array.isArray(contract.scenes) ? contract.scenes : [];
  if (!scenes.length) fail("at least one scene required");

  const seen = new Set();
  for (const scene of scenes) {
    const id = nonEmpty(scene?.scene_id);
    if (!id || seen.has(id)) fail("scene ids must be unique and non-empty");
    seen.add(id);
  }

  const global = canonicalGlobalLayer(contract);
  const scriptText = scenes.map(sceneNarration).join(" ").replace(/\s+/g, " ").trim();
  const scriptSha = sha256Text(scriptText);
  const sceneNodes = scenes.map(sceneNode);
  const beatCount = sceneNodes.reduce(
    (sum, node) => sum + node.ATTENTION_BEATS.length,
    0,
  );

  const nodes = [
    {
      id: "MASTER_BRIEF",
      kind: "MASTER_BRIEF",
      depends_on: [],
      payload: {
        content_id: nonEmpty(contract?.content?.content_id) || null,
        title: nonEmpty(contract?.content?.title),
        profile_name: nonEmpty(contract?.creative?.profile_name),
        method_version: nonEmpty(contract?.content?.method_version),
        content_brief: nonEmpty(contract?.creative?.content_brief),
        global_layers: global,
      },
    },
    {
      id: "SCRIPT_PROMPT",
      kind: "SCRIPT_PROMPT",
      depends_on: ["MASTER_BRIEF"],
      payload: {
        verbatim: true,
        script_sha256: scriptSha,
        scene_count: scenes.length,
      },
    },
    {
      id: "STORYBOARD_PROMPT",
      kind: "STORYBOARD_PROMPT",
      depends_on: ["SCRIPT_PROMPT"],
      payload: {
        pacing: contract?.creative?.pacing || null,
        production_defaults:
          contract?.creative?.production_defaults || null,
        separation_policy:
          "semantic_scene_boundaries_are_independent_from_attention_beats",
      },
    },
    ...sceneNodes,
    {
      id: "VOICE_SPEC",
      kind: "VOICE_SPEC",
      depends_on: sceneNodes.map((node) => node.id),
      payload: {
        engine: nonEmpty(contract?.audio?.engine),
        scenes: scenes.map((scene) => ({
          scene_id: scene.scene_id,
          target_wpm: Number(scene?.voice?.target_wpm || 0) || null,
          relative_speed_pct:
            Number(scene?.voice?.relative_speed_pct || 100),
          pause_after_ms: Number(scene?.voice?.pause_after_ms || 0),
          emphasis: nonEmpty(scene?.voice?.emphasis),
          intent: nonEmpty(scene?.voice?.intent),
          prosody_cues: Array.isArray(scene?.voice?.prosody_cues)
            ? scene.voice.prosody_cues
            : [],
          verbatim: scene?.voice?.verbatim !== false,
        })),
      },
    },
    {
      id: "CAPTION_SPEC",
      kind: "CAPTION_SPEC",
      depends_on: sceneNodes.map((node) => node.id),
      payload: {
        generated_image_text_allowed: false,
        overlay_only: true,
        language: nonEmpty(contract?.creative?.language),
        scenes: scenes.map((scene) => ({
          scene_id: scene.scene_id,
          screen_text: nonEmpty(scene.screen_text),
        })),
      },
    },
    {
      id: "EDIT_SPEC",
      kind: "EDIT_SPEC",
      depends_on: ["VOICE_SPEC", "CAPTION_SPEC", ...sceneNodes.map((node) => node.id)],
      payload: {
        engine: contract?.engine || null,
        production: contract?.production || null,
        pacing: contract?.creative?.pacing || null,
        attention_beat_count: beatCount,
      },
    },
  ];

  const graphCore = {
    schema: PROMPT_GRAPH_SCHEMA,
    graph_version: PROMPT_GRAPH_VERSION,
    content_id: nonEmpty(contract?.content?.content_id) || null,
    profile_name: nonEmpty(contract?.creative?.profile_name),
    script_sha256: scriptSha,
    scene_count: scenes.length,
    attention_beat_count: beatCount,
    node_count: nodes.length,
    estimated_structured_subprompts:
      nodes.length + beatCount,
    nodes,
    terminal_node: "EDIT_SPEC",
    policy: {
      one_human_brief_target: true,
      global_layers_are_referenced_not_reinvented_per_scene: true,
      generated_image_text_allowed: false,
      model_calls_performed: false,
      gpu_execution_performed: false,
      airtable_mutation_performed: false,
      publication_authorized: false,
    },
  };

  return {
    ...graphCore,
    prompt_graph_sha256: sha256Text(stableJson(graphCore)),
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    fail(
      "usage: node scripts/video-prompt-graph.mjs storyboard.json prompt-graph.json",
    );
  }
  const contract = JSON.parse(readFileSync(resolve(input), "utf8"));
  const graph = buildPromptGraph(contract);
  writeFileSync(resolve(output), JSON.stringify(graph, null, 2) + "\n", "utf8");
  process.stdout.write(
    JSON.stringify({
      ok: true,
      schema: graph.schema,
      output: resolve(output),
      node_count: graph.node_count,
      prompt_graph_sha256: graph.prompt_graph_sha256,
    }) + "\n",
  );
}
