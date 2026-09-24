function clean(value) {
  return String(value ?? "").trim();
}

export const PUBLICATION_FIELDS = {
  bluesky: { id: "ID Bluesky", url: "URL Bluesky" },
  youtube: { id: "ID YouTube", url: "URL YouTube" },
  tiktok: { id: "ID TikTok", url: "URL TikTok" },
  instagram: { id: "ID Instagram", url: "URL Instagram" },
  facebook: { id: "ID Facebook", url: "URL Facebook" },
  linkedin: { id: "ID LinkedIn", url: "URL LinkedIn" },
  x: { id: "ID X", url: "URL X" },
  threads: { id: "ID Threads", url: "URL Threads" },
  pinterest: { id: "ID Pinterest", url: "URL Pinterest" },
  snapchat: { id: "ID Snapchat", url: "URL Snapchat" },
};

export function publicationResult(providerInput, gatewayData = {}) {
  const provider = clean(providerInput).toLowerCase();
  const result = gatewayData?.result && typeof gatewayData.result === "object" ? gatewayData.result : {};
  const idByProvider = {
    bluesky: result.post_id,
    youtube: result.video_id,
    tiktok: result.video_id || result.post_id || result.publish_id,
    instagram: result.media_id,
    facebook: result.post_id || result.video_id || result.photo_id,
    linkedin: result.post_id,
    x: result.post_id,
    threads: result.thread_id,
    pinterest: result.pin_id,
    snapchat: result.post_id || result.media_id,
  };
  const id = clean(idByProvider[provider] || result.external_id || result.id);
  let url = clean(result.url || result.permalink || result.share_url);
  if (!url && id) {
    if (provider === "youtube") url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    if (provider === "x") url = `https://x.com/i/web/status/${encodeURIComponent(id)}`;
    if (provider === "facebook" && (result.video_id || result.media_type === "reel")) url = `https://www.facebook.com/watch/?v=${encodeURIComponent(result.video_id || id)}`;
    if (provider === "linkedin") url = `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}`;
    if (provider === "pinterest") url = `https://www.pinterest.com/pin/${encodeURIComponent(id)}/`;
  }
  return { provider, id, url };
}

export function publicationFields(providerInput, gatewayData = {}) {
  const provider = clean(providerInput).toLowerCase();
  const mapping = PUBLICATION_FIELDS[provider];
  if (!mapping) return { fields: {}, id: "", url: "", reason: "provider_unmapped" };
  const publication = publicationResult(provider, gatewayData);
  if (!publication.id) return { fields: {}, ...publication, reason: "external_id_absent" };
  const fields = { [mapping.id]: publication.id };
  if (publication.url) fields[mapping.url] = publication.url;
  return { fields, ...publication, reason: "" };
}
