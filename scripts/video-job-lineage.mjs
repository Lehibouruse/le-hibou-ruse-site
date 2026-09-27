function pickStatus(record) {
  const value = record?.fields?.Statut;
  return typeof value === "object" && value
    ? String(value.name || "")
    : String(value || "");
}

function parseOptions(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14}$/.test(String(value || "").trim());
}

export function validateReuseLineage({
  current_job_id,
  current_content_id,
  reuse_from_job_id,
  parent_record,
} = {}) {
  const currentJobId = String(current_job_id || "").trim();
  const currentContentId = String(current_content_id || "").trim();
  const reuseFromJobId = String(reuse_from_job_id || "").trim();

  if (!reuseFromJobId) {
    return {
      ok: true,
      enabled: false,
      reason: "no_reuse_parent",
      lineage: null,
    };
  }

  if (!isRecordId(currentJobId) || !isRecordId(currentContentId) || !isRecordId(reuseFromJobId)) {
    return { ok: false, enabled: true, reason: "invalid_record_id", lineage: null };
  }
  if (reuseFromJobId === currentJobId) {
    return { ok: false, enabled: true, reason: "self_reuse_forbidden", lineage: null };
  }
  if (!parent_record || String(parent_record.id || "") !== reuseFromJobId) {
    return { ok: false, enabled: true, reason: "reuse_parent_not_found", lineage: null };
  }

  const fields = parent_record.fields || {};
  const type = typeof fields.Type === "object" && fields.Type
    ? String(fields.Type.name || "")
    : String(fields.Type || "");
  if (type !== "VIDEO_RENDER") {
    return { ok: false, enabled: true, reason: "reuse_parent_wrong_type", lineage: null };
  }

  const status = pickStatus(parent_record);
  if (status !== "Completed") {
    return {
      ok: false,
      enabled: true,
      reason: "reuse_parent_not_completed",
      lineage: {
        parent_job_id: reuseFromJobId,
        parent_status: status || null,
      },
    };
  }

  const parentOptions = parseOptions(fields["Options JSON"]);
  const parentContentId = String(parentOptions.content_id || "").trim();
  const parentWorker = String(fields.Worker || "").trim() || null;
  const parentResultSha256 = /^[0-9a-f]{64}$/i.test(String(fields["Hash résultat"] || "").trim())
    ? String(fields["Hash résultat"]).trim().toLowerCase()
    : null;
  if (!isRecordId(parentContentId) || parentContentId !== currentContentId) {
    return {
      ok: false,
      enabled: true,
      reason: "reuse_parent_content_mismatch",
      lineage: {
        parent_job_id: reuseFromJobId,
        parent_status: status,
        parent_content_id: parentContentId || null,
      },
    };
  }

  const parentReuse = String(parentOptions.reuse_from_job_id || "").trim();
  if (parentReuse && !isRecordId(parentReuse)) {
    return {
      ok: false,
      enabled: true,
      reason: "reuse_parent_invalid_ancestor_id",
      lineage: {
        parent_job_id: reuseFromJobId,
        parent_status: status,
        parent_content_id: parentContentId,
      },
    };
  }
  if (parentReuse === currentJobId) {
    return {
      ok: false,
      enabled: true,
      reason: "direct_reuse_cycle",
      lineage: {
        parent_job_id: reuseFromJobId,
        parent_status: status,
        parent_content_id: parentContentId,
      },
    };
  }

  return {
    ok: true,
    enabled: true,
    reason: "reuse_parent_valid",
    lineage: {
      schema: "HIBOU_VIDEO_REUSE_LINEAGE_V1",
      parent_job_id: reuseFromJobId,
      parent_status: status,
      parent_content_id: parentContentId,
      parent_worker: parentWorker,
      parent_result_sha256: parentResultSha256,
      grandparent_job_id: isRecordId(parentReuse) ? parentReuse : null,
      human_review_required: true,
      publication_authorized: false,
    },
  };
}

export { isRecordId };
