import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNegativePolicyCoverage,
  negativePolicyCoveragePass,
  negativePolicyHumanReviewPass,
} from "../scripts/video-negative-policy-coverage.mjs";

// Current Airtable GLOBAL exclusions. The commas within the originality clause
// are part of that exclusion, rather than separate permissions or exclusions.
const currentNegativePrompt = "no humans, no human faces, no photorealism, no 3D toy mascot, no kawaii childlike mascot, no generic bird, no duck, no sparrow, no woodpecker, no random avian species, no owl identity drift, no different owl face, no character redesign between scenes, no unrelated mascot, no empty background, no luxury-palace cliché, no unrelated decorative shot, no rapid slideshow, no frantic hard cuts, no full-frame replacement every sentence, no camera shake, no oscillating zoom, no random pan, no excessive transitions, no English visible in the rendered image, no pseudo-English visible text, no invented word, no gibberish signage, no generated brand name, no critical baked-in text, no duplicated branding, no unintended large brand title outside the deliberate outro, no presentation slide layout, no cluttered infographic layout that obscures financial relations, no tiny unreadable labels, no copying competitor characters, palettes, protected assets, wording or exact mise-en-scène, no oversimplified empty financial diagram, no generic finance icon collage, no decorative chart disconnected from narration, no semantic loss when labels or numbers are removed, no placeholder-only arrows or blocks, no excessive whitespace that weakens the mechanism, no collapsing a requested multi-step comparison or timeline into one generic symbol";

test("all 43 current GLOBAL exclusions route to named reviews without claiming native FLUX conditioning", () => {
  const coverage = buildNegativePolicyCoverage(currentNegativePrompt);
  assert.equal(coverage.clause_count, 43);
  assert.equal(coverage.native_negative_conditioning, false);
  assert.equal(coverage.coverage_complete, true);
  assert.equal(coverage.groups.length, 10);
  assert.equal(coverage.groups.reduce((sum, group) => sum + group.clauses.length, 0), 43);
  assert.equal(coverage.clauses.every(clause =>
    coverage.groups.some(group => group.id === clause.category &&
      group.human_review_check_id === clause.human_review_check_id &&
      group.clauses.includes(clause.clause))), true);
  assert.equal(coverage.groups.find(group => group.id === "originality").clauses.length, 1);
  assert.equal(negativePolicyCoveragePass(coverage, currentNegativePrompt), true);
});

test("new or unparseable exclusions block instead of silently losing negative policy", () => {
  assert.throws(() => buildNegativePolicyCoverage(currentNegativePrompt + ", no sepia"), /uncovered exclusions/);
  assert.throws(() => buildNegativePolicyCoverage(""), /is empty/);
  assert.throws(() => buildNegativePolicyCoverage("avoid humans"), /unparseable exclusion/);
});

test("coverage flags cannot substitute for missing exclusions, routing or current source hashes", () => {
  const coverage = buildNegativePolicyCoverage(currentNegativePrompt);
  const missing = structuredClone(coverage);
  missing.clauses.pop();
  missing.clause_count--;
  assert.equal(negativePolicyCoveragePass(missing, currentNegativePrompt), false);
  const nativeClaim = { ...coverage, native_negative_conditioning: true };
  assert.equal(negativePolicyCoveragePass(nativeClaim, currentNegativePrompt), false);
  const changedRoute = structuredClone(coverage);
  changedRoute.groups[0].prompt_marker = null;
  assert.equal(negativePolicyCoveragePass(changedRoute, currentNegativePrompt), false);
  assert.equal(negativePolicyCoveragePass(coverage, currentNegativePrompt + ", no identity drift"), false);
});

test("all 43 exclusions require explicit human passes bound to the same GLOBAL source", () => {
  const coverage = buildNegativePolicyCoverage(currentNegativePrompt);
  const review = {
    negative_policy_source_sha256: coverage.source_sha256,
    negative_policy_clause_count: 43,
    negative_policy_review_check_ids: coverage.groups.map(group => group.human_review_check_id),
    checklist: coverage.groups.map(group => ({
      id: group.human_review_check_id,
      status: "PASS",
      human_pass: true,
      negative_policy_source_sha256: coverage.source_sha256,
      source_exclusions: group.clauses,
    })),
  };
  assert.equal(negativePolicyHumanReviewPass(review, coverage), true);
  const pending = structuredClone(review);
  pending.checklist.at(-1).status = "PENDING_HUMAN";
  assert.equal(negativePolicyHumanReviewPass(pending, coverage), false);
  const omitted = structuredClone(review);
  omitted.checklist.at(-1).source_exclusions.pop();
  assert.equal(negativePolicyHumanReviewPass(omitted, coverage), false);
  const duplicate = structuredClone(review);
  duplicate.checklist.push(duplicate.checklist[0]);
  assert.equal(negativePolicyHumanReviewPass(duplicate, coverage), false);
  assert.equal(negativePolicyHumanReviewPass({ ...review, negative_policy_source_sha256: "old" }, coverage), false);
});
