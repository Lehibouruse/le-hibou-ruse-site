import { createHash } from "node:crypto";

const normalize = value => String(value || "").normalize("NFD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const GROUPS = [
  {
    id: "people_absence",
    label: "Aucun humain ou visage humain dans les images générées",
    clauses: ["no humans", "no human faces"],
    prompt_marker: "BACKGROUND_POLICY:",
    machine_evidence: ["creative_qc:unexpected_character_contrast"],
  },
  {
    id: "editorial_style",
    label: "Style éditorial adulte en 2D, sans rendu photo ni mascotte jouet",
    clauses: ["no photorealism", "no 3D toy mascot", "no kawaii childlike mascot"],
    prompt_marker: "BACKGROUND_POLICY:",
    machine_evidence: ["creative_qc:global_style"],
  },
  {
    id: "canonical_character",
    label: "Identité constante du Hibou, sans autre oiseau ou mascotte",
    clauses: [
      "no generic bird", "no duck", "no sparrow", "no woodpecker",
      "no random avian species", "no owl identity drift", "no identity drift",
      "no different owl face", "no character redesign between scenes",
      "no unrelated mascot",
    ],
    prompt_marker: "BACKGROUND_POLICY:",
    machine_evidence: ["deterministic_character_overlay", "creative_qc:unexpected_character_contrast"],
  },
  {
    id: "relevant_background",
    label: "Décor utile à la scène, sans cliché de luxe ni plan décoratif",
    clauses: ["no empty background", "no luxury-palace cliché", "no unrelated decorative shot"],
    prompt_marker: "BACKGROUND_POLICY:",
    machine_evidence: ["creative_qc:semantic_brief"],
  },
  {
    id: "paced_montage",
    label: "Montage motivé par le sens, sans mouvements ni coupes parasites",
    clauses: [
      "no rapid slideshow", "no frantic hard cuts", "no full-frame replacement every sentence",
      "no camera shake", "no oscillating zoom", "no random pan", "no excessive transitions",
    ],
    prompt_marker: null,
    machine_evidence: ["specific_action_montage_audit", "master_qc"],
  },
  {
    id: "generated_text_absence",
    label: "Aucun texte, faux mot ou marque généré dans les fonds",
    clauses: [
      "no English visible in the rendered image", "no pseudo-English visible text",
      "no invented word", "no gibberish signage", "no generated brand name",
      "no critical baked-in text",
    ],
    prompt_marker: "STRICT_GLYPH_FREE_LOCK:",
    machine_evidence: ["generated_background_text_qc", "selected_background_text_qc"],
  },
  {
    id: "brand_uniqueness",
    label: "Signature de marque unique et seulement à l’endroit prévu",
    clauses: ["no duplicated branding", "no unintended large brand title outside the deliberate outro"],
    prompt_marker: "STRICT_GLYPH_FREE_LOCK:",
    machine_evidence: ["deterministic_brand_postproduction"],
  },
  {
    id: "readable_layout",
    label: "Composition lisible, sans planche de présentation ni labels minuscules",
    clauses: [
      "no presentation slide layout", "no cluttered infographic layout that obscures financial relations",
      "no tiny unreadable labels",
    ],
    prompt_marker: "RELATION_POLICY:",
    machine_evidence: ["creative_qc:semantic_brief", "selected_background_text_qc"],
  },
  {
    id: "originality",
    label: "Aucun élément protégé ou mise en scène copiée d’un concurrent",
    clauses: ["no copying competitor characters, palettes, protected assets, wording or exact mise-en-scène"],
    prompt_marker: null,
    machine_evidence: ["human_review:original_identity"],
  },
  {
    id: "financial_mechanics",
    label: "Mécanique financière fidèle aux étapes, quantités et relations demandées",
    clauses: [
      "no oversimplified empty financial diagram", "no generic finance icon collage",
      "no decorative chart disconnected from narration",
      "no semantic loss when labels or numbers are removed",
      "no placeholder-only arrows or blocks",
      "no excessive whitespace that weakens the mechanism",
      "no collapsing a requested multi-step comparison or timeline into one generic symbol",
    ],
    prompt_marker: "RELATION_POLICY:",
    machine_evidence: ["creative_qc:semantic_brief", "specific_action_montage_audit"],
  },
];

const CLAUSE_GROUP = new Map(GROUPS.flatMap(group =>
  group.clauses.map(clause => [normalize(clause), group])));

export function buildNegativePolicyCoverage(negativePrompt) {
  const source = String(negativePrompt || "").trim();
  if (!source) throw new Error("GLOBAL negative_prompt is empty");
  const clauses = source.split(/,\s*(?=no\s+)/iu).map(value => value.trim()).filter(Boolean);
  if (!clauses.length || clauses.some(clause => !/^no\s+/iu.test(clause))) {
    throw new Error("GLOBAL negative_prompt has an unparseable exclusion");
  }
  const unknown = clauses.filter(clause => !CLAUSE_GROUP.has(normalize(clause)));
  if (unknown.length) {
    throw new Error("GLOBAL negative_prompt has uncovered exclusions: " + unknown.join(" | "));
  }
  const activeGroups = GROUPS.filter(group => clauses.some(clause =>
    CLAUSE_GROUP.get(normalize(clause))?.id === group.id));
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  return {
    schema: "HIBOU_GLOBAL_NEGATIVE_COVERAGE_V1",
    source_sha256: sourceSha256,
    clause_count: clauses.length,
    coverage_complete: true,
    native_negative_conditioning: false,
    clauses: clauses.map((clause, index) => {
      const group = CLAUSE_GROUP.get(normalize(clause));
      return {
        index: index + 1,
        clause,
        category: group.id,
        prompt_marker: group.prompt_marker,
        human_review_check_id: `negative_${group.id}`,
      };
    }),
    groups: activeGroups.map(group => ({
      id: group.id,
      label: group.label,
      clauses: clauses.filter(clause => CLAUSE_GROUP.get(normalize(clause))?.id === group.id),
      prompt_marker: group.prompt_marker,
      human_review_check_id: `negative_${group.id}`,
      machine_evidence: group.machine_evidence,
    })),
  };
}

// Coverage is a routing receipt, not proof that the pixels obey an exclusion.
// Rebuild it from the authoritative GLOBAL value instead of trusting a stored
// coverage_complete flag, a clause count, or a previous render's source hash.
export function negativePolicyCoveragePass(coverage, negativePrompt) {
  try {
    const expected = buildNegativePolicyCoverage(negativePrompt);
    return coverage?.schema === expected.schema &&
      coverage?.coverage_complete === true &&
      coverage?.native_negative_conditioning === false &&
      coverage?.source_sha256 === expected.source_sha256 &&
      coverage?.clause_count === expected.clause_count &&
      JSON.stringify(coverage?.clauses) === JSON.stringify(expected.clauses) &&
      JSON.stringify(coverage?.groups) === JSON.stringify(expected.groups);
  } catch {
    return false;
  }
}

export function negativePolicyRequestPass(request, coverage) {
  const app = request?.prompt_application;
  const prompt = request?.overrides?.[app?.prompt_node_id]?.[app?.prompt_input];
  const categories = (coverage?.groups || []).map(group => group.id);
  return app?.schema === "HIBOU_IMAGE_PROMPT_APPLICATION_V2" &&
    app?.negative_policy_source_sha256 === coverage?.source_sha256 &&
    app?.negative_policy_prompt_coverage === true &&
    JSON.stringify(app?.negative_policy_categories) === JSON.stringify(categories) &&
    typeof prompt === "string" &&
    createHash("sha256").update(prompt).digest("hex") === app?.compiled_prompt_sha256 &&
    (coverage?.groups || []).every(group =>
      !group.prompt_marker || prompt.includes(group.prompt_marker));
}

export function negativePolicyHumanReviewPass(review, coverage) {
  const groups = coverage?.groups || [];
  const ids = groups.map(group => group.human_review_check_id);
  return groups.length > 0 &&
    review?.negative_policy_source_sha256 === coverage?.source_sha256 &&
    review?.negative_policy_clause_count === coverage?.clause_count &&
    JSON.stringify(review?.negative_policy_review_check_ids) === JSON.stringify(ids) &&
    groups.every(group => {
      const items = (Array.isArray(review?.checklist) ? review.checklist : [])
        .filter(item => item?.id === group.human_review_check_id);
      return items.length === 1 && items[0].human_pass === true &&
        items[0].status === "PASS" &&
        items[0].negative_policy_source_sha256 === coverage.source_sha256 &&
        JSON.stringify(items[0].source_exclusions) === JSON.stringify(group.clauses);
    });
}
