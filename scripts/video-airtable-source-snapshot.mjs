const BASE_ID = "appWyUX7TYPNrDbyP";
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : item?.id);
}

function requireRecord(record, label) {
  if (!RECORD_ID.test(String(record?.id || "")) || !record?.fields ||
      typeof record.fields !== "object" || Array.isArray(record.fields)) {
    throw new Error(`Airtable ${label} record is missing or invalid`);
  }
}

/** Capture the exact Airtable records used to build a queued storyboard. */
export function buildServerAirtableSourceSnapshot(content, profile, scenes, {
  capturedAt = new Date(),
} = {}) {
  requireRecord(content, "content");
  requireRecord(profile, "profile");
  const profileIds = linkedIds(content.fields["Profil vidéo"]);
  const sceneIds = linkedIds(content.fields["Scènes vidéo"]);
  if (profileIds.length !== 1 || profileIds[0] !== profile.id) {
    throw new Error("Airtable source snapshot profile link mismatch");
  }
  if (sceneIds.length < 8 || sceneIds.length > 18 ||
      new Set(sceneIds).size !== sceneIds.length ||
      !Array.isArray(scenes) || scenes.length !== sceneIds.length) {
    throw new Error("Airtable source snapshot scene links invalid");
  }
  const byId = new Map();
  for (const scene of scenes) {
    requireRecord(scene, "scene");
    if (byId.has(scene.id)) {
      throw new Error("Airtable source snapshot duplicate scene record");
    }
    byId.set(scene.id, scene);
  }
  if (sceneIds.some((id) => !byId.has(id))) {
    throw new Error("Airtable source snapshot scene link mismatch");
  }
  const captureMs = capturedAt instanceof Date
    ? capturedAt.getTime()
    : Date.parse(String(capturedAt));
  if (!Number.isFinite(captureMs)) {
    throw new Error("Airtable source snapshot capture time invalid");
  }
  const rawRecords = structuredClone({
    content,
    profile,
    scenes: sceneIds.map((id) => byId.get(id)),
  });
  return {
    schema: "HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1",
    capture_method: "server_airtable_live",
    base_id: BASE_ID,
    captured_at: new Date(captureMs).toISOString(),
    expires_at: new Date(captureMs + 3_600_000).toISOString(),
    content_id: content.id,
    profile_record_id: profile.id,
    ...rawRecords,
  };
}
