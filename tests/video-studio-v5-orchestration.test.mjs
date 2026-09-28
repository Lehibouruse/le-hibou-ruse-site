import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const master=readFileSync(new URL("../scripts/video-master.mjs",import.meta.url),"utf8");
const sync=readFileSync(new URL("../scripts/video-airtable-sync.mjs",import.meta.url),"utf8");
const promote=readFileSync(new URL("../scripts/video-storyboard-promote.mjs",import.meta.url),"utf8");
const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const queueRoute=readFileSync(new URL("../app/api/local-worker-queue/route.js",import.meta.url),"utf8");
const candidateReview=readFileSync(new URL("../scripts/video-candidate-review.mjs",import.meta.url),"utf8");
const humanReview=readFileSync(new URL("../scripts/video-human-review-package.mjs",import.meta.url),"utf8");

test("V5 execution needs both GLOBAL contract feature and local runtime gate",()=>{
 assert.match(master,/contract\?\.features\?\.\[name\]===true && envFlag\(envName\)/);
 for(const name of ["HIBOU_VIDEO_TIMELINE_V1","HIBOU_VIDEO_PROSODY_V1","HIBOU_VIDEO_MUSIC_V1","HIBOU_VIDEO_CREATIVE_QC_V1","HIBOU_VIDEO_POSE_REGISTRY_V1","HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1","HIBOU_VIDEO_HUMAN_SELECTION_V1"]) assert.match(master,new RegExp(name));
});

test("Airtable export separates GLOBAL feature/music configuration from scene-specific events",()=>{
 assert.match(sync,/features:\{/);
 assert.match(sync,/video_pose_registry_v1/);
 assert.match(sync,/video_incremental_retouch_v1/);
 assert.match(sync,/Mode production par défaut/);
 assert.match(sync,/Timeline JSON/);
 assert.match(sync,/Prosodie JSON/);
 assert.match(sync,/Pose Hibou/);
 assert.match(sync,/GLOBAL only/);
});

test("promotion copies timed object and pose assets before render",()=>{
 assert.match(promote,/scene\?\.timeline\?\.events/);
 assert.match(promote,/\["object","pose"\]/);
 assert.match(promote,/timeline-\$\{index\+1\}/);
});

test("pose registry is commit-pinned and applied before asset resolution",()=>{
 assert.match(master,/video-hibou-pose-registry\.mjs/);
 assert.match(master,/video\/assets\/hibou-poses\.registry\.v1\.json/);
 assert.match(master,/stage\(state,"pose_registry"/);
 assert.ok(master.indexOf('stage(state,"pose_registry"') < master.indexOf('stage(state,"asset_resolution"'));
});

test("scene timeline cannot override a disabled GLOBAL timeline feature",()=>{
 assert.match(master,/delete scene\.timeline/);
 assert.match(master,/video_timeline_v1","HIBOU_VIDEO_TIMELINE_V1/);
 assert.match(master,/stripped_scene_count/);
});


test("incremental reuse is opt-in, commit-pinned and never authorizes publication",()=>{
 assert.match(master,/video-iteration-plan\.mjs/);
 assert.match(master,/--reuse-from requires GLOBAL video_incremental_retouch_v1/);
 assert.match(master,/seedIncrementalCaches/);
 assert.match(master,/publication_authorized:false/);
});


test("remote queue preview policy reaches the local master without changing scene GLOBAL identity",()=>{
 assert.match(worker,/--production-mode=\$\{productionMode\}/);
 assert.match(worker,/--candidates-per-scene=\$\{candidatesPerScene\}/);
 assert.match(worker,/job\.options\?\.preview_mode === true/);
 assert.match(master,/execution_override:executionOverride/);
 assert.match(master,/global_visual_identity_unchanged:true/);
 assert.match(master,/publication_authorized:false/);
});


test("remote incremental reuse accepts only a prior Airtable job id and never an arbitrary path",()=>{
 assert.match(queueRoute,/reuse_from_job_id/);
 assert.match(queueRoute,/invalid_reuse_from_job_id/);
 assert.match(worker,/reuse_from_job_id/);
 assert.match(worker,/--reuse-from=\$\{previousRoot\}/);
 assert.match(worker,/path\.join\([\s\S]*VIDEO_OUTPUT_ROOT[\s\S]*safePart\(reuseFromJobId\)/);
 assert.doesNotMatch(queueRoute,/reuse_from_path/);
});


test("image ranking produces a separate advisory human candidate review artifact",()=>{
 assert.match(master,/video-candidate-review\.mjs/);
 assert.match(master,/candidate-review\.json/);
 assert.match(master,/machine_ranking_is_advisory:true/);
 assert.match(master,/human_candidate_review_required:true/);
 assert.match(candidateReview,/HIBOU_CANDIDATE_REVIEW_V1/);
 assert.match(candidateReview,/human_selected_candidate_id: null/);
 assert.match(candidateReview,/no_candidate_is_auto_approved: true/);
 assert.match(candidateReview,/publication_authorized: false/);
});

test("V4 master produces a consolidated human-review manifest before publication",()=>{
 assert.match(master,/video-human-review-package\.mjs/);
 assert.match(master,/stage\(state,"human_review_manifest"/);
 assert.match(master,/human-review\.json/);
 assert.match(master,/kind:"human_review"/);
 assert.match(master,/human_review_package:state\.human_review\|\|null/);
 assert.match(humanReview,/HIBOU_HUMAN_REVIEW_PACKAGE_V1/);
 assert.match(humanReview,/PENDING_HUMAN_REVIEW/);
 assert.match(humanReview,/all_checklist_items_require_human_decision: true/);
 assert.match(humanReview,/publication_authorized: false/);
});


test("FINAL human candidate checkpoint pauses cleanly and resumes without regenerating images",()=>{
 assert.match(master,/video_human_candidate_selection_v1/);
 assert.match(master,/HIBOU_VIDEO_HUMAN_SELECTION_V1/);
 assert.match(master,/WAITING_HUMAN_SELECTION/);
 assert.match(master,/awaiting-human-selection\.json/);
 assert.match(master,/candidate-decisions\.json/);
 assert.match(master,/video-candidate-selection-apply\.mjs/);
 assert.match(master,/unlinkSync\(waitingHumanSelectionPath\)/);
 assert.match(worker,/HIBOU_VIDEO_RENDER_WAITING_HUMAN_SELECTION_V1/);
 assert.match(worker,/reportVideoProgress\(job, "Paused"/);
 assert.match(worker,/images_will_be_reused: true/);
 assert.match(queueRoute,/isHumanSelectionPause/);
 assert.match(queueRoute,/ALLOWED_STATUS = new Set\(\["Running", "Paused"/);
});


test("incremental review diff is commit-pinned and remains human-only",()=>{
 assert.match(master,/video-review-diff\.mjs/);
 assert.match(master,/stage\(state,"review_diff"/);
 assert.match(master,/review-diff\.json/);
 assert.match(master,/kind:"review_diff"/);
 assert.match(humanReview,/previous_human_approval_auto_reused:\s*false/);
 assert.match(humanReview,/always_required_global_checks/);
});


test("remote human decisions are fingerprint-bound before local staging and skip ComfyUI wake-up",()=>{
 assert.match(worker,/human_candidate_decisions/);
 assert.match(worker,/HIBOU_HUMAN_IMAGE_SELECTION_V1/);
 assert.match(worker,/remote human selection fingerprint mismatch/);
 assert.match(worker,/candidate-decisions\.json/);
 assert.match(worker,/humanSelectionResume = true/);
 assert.match(worker,/if \(!humanSelectionResume\) \{/);
 assert.match(worker,/human-selection resume skips ComfyUI wake-up/);
 assert.match(worker,/review_fingerprint_sha256: reviewFingerprint/);
 assert.match(queueRoute,/HUMAN_SELECTION_RESUME_SCHEDULED/);
 assert.match(queueRoute,/resume_human_selection !== true/);
});

test("remote human resume remains a human gate and never authorizes publication",()=>{
 assert.match(worker,/human_review_required: true/);
 assert.match(worker,/publication_authorized: false/);
 assert.match(queueRoute,/human_review_required: true/);
 assert.match(queueRoute,/publication_authorized: false/);
});
