function clean(v){ return String(v ?? "").trim(); }

export async function inspectLemonVariantFiles({ apiKey, variantId, fetchImpl = fetch } = {}) {
  const key = clean(apiKey);
  const variant = clean(variantId);
  if (!key) throw new Error("LEMON_SQUEEZY_API_KEY absent");
  if (!/^\d+$/.test(variant)) throw new Error("variantId invalide");

  const url = new URL("https://api.lemonsqueezy.com/v1/files");
  url.searchParams.set("filter[variant_id]", variant);
  url.searchParams.set("page[size]", "100");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.message || response.statusText;
    throw new Error(`Lemon files inspection ${response.status}: ${detail}`);
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const files = rows.map((row) => {
    const a = row?.attributes || {};
    return {
      id: clean(row?.id),
      variant_id: clean(a.variant_id || variant),
      identifier: clean(a.identifier),
      name: clean(a.name),
      extension: clean(a.extension).toLowerCase(),
      size_bytes: Number.isFinite(Number(a.size)) ? Number(a.size) : null,
      size_formatted: clean(a.size_formatted),
      version: clean(a.version),
      sort: Number.isFinite(Number(a.sort)) ? Number(a.sort) : null,
      signed_download_url_present: Boolean(clean(a.download_url)),
    };
  });

  const pdfs = files.filter((f) => f.extension === "pdf" || f.name.toLowerCase().endsWith(".pdf"));
  return {
    provider: "lemon_squeezy_native_files",
    variant_id: variant,
    file_count: files.length,
    pdf_count: pdfs.length,
    ready_for_pdf_delivery: pdfs.length > 0,
    files,
    security: {
      download_urls_exposed_by_this_inspector: false,
      note: "Inspector intentionally strips signed download URLs. Lemon documents file URLs as signed, 1-hour expiry and rate-limited.",
    },
    side_effects: false,
    paid_fallback: false,
  };
}
