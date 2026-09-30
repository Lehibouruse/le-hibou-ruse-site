import assert from "node:assert/strict";
import test from "node:test";
import { validateReuseLineage } from "../scripts/video-job-lineage.mjs";

const currentJob = "recABCDEFGHIJKLMN";
const parentJob = "recNOPQRSTUVWXYZA";
const contentId = "recCONTENT1234567";

function parent({
  id = parentJob,
  status = "Completed",
  type = "VIDEO_RENDER",
  parentContentId = contentId,
  reuseFrom = "",
  worker = "ROG-TEST",
  resultSha256 = "a".repeat(64),
} = {}) {
  return {
    id,
    fields: {
      Statut: status,
      Type: type,
      Worker: worker,
      "Hash résultat": resultSha256,
      "Options JSON": JSON.stringify({
        content_id: parentContentId,
        reuse_from_job_id: reuseFrom || undefined,
      }),
    },
  };
}

test("reuse lineage accepts a completed VIDEO_RENDER parent for the same content", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: parentJob,
    parent_record: parent(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.enabled, true);
  assert.equal(result.reason, "reuse_parent_valid");
  assert.equal(result.lineage.parent_job_id, parentJob);
  assert.equal(result.lineage.parent_content_id, contentId);
  assert.equal(result.lineage.parent_worker, "ROG-TEST");
  assert.equal(result.lineage.parent_result_sha256, "a".repeat(64));
  assert.equal(result.lineage.publication_authorized, false);
});

test("reuse lineage rejects non-completed parents", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: parentJob,
    parent_record: parent({ status: "Running" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "reuse_parent_not_completed");
});

test("reuse lineage rejects content mismatch", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: parentJob,
    parent_record: parent({ parentContentId: "recOTHER12345678" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "reuse_parent_content_mismatch");
});

test("reuse lineage rejects direct cycles", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: parentJob,
    parent_record: parent({ reuseFrom: currentJob }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "direct_reuse_cycle");
});

test("reuse lineage leaves ordinary jobs untouched", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: "",
    parent_record: null,
  });

  assert.deepEqual(result, {
    ok: true,
    enabled: false,
    reason: "no_reuse_parent",
    lineage: null,
  });
});


test("reuse lineage rejects an invalid ancestor record ID", () => {
  const result = validateReuseLineage({
    current_job_id: currentJob,
    current_content_id: contentId,
    reuse_from_job_id: parentJob,
    parent_record: parent({ reuseFrom: "not-an-airtable-record" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "reuse_parent_invalid_ancestor_id");
});
