import { getRecords, TABLES, configMap } from "../../../lib/airtable";
import { renderBookDocument } from "../../../lib/book-renderer.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";

// Private master export. This comment intentionally triggers a fresh deployment check after a prior Vercel build-rate limit.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function truthy(value) {
  return value === true || ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function chapterReady(record) {
  const fields = record?.fields || {};
  return Boolean(
    String(fields["Contenu V1"] || "").trim()
    && fields["Prêt export"] === true
    && fields["Validation humaine"] === true
    && String(fields["QC éditorial"] || "").toLowerCase() !== "fail",
  );
}

export async function GET(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));
  } catch (error) {
    return new Response(String(error?.message || "Unauthorized").slice(0, 300), { status: 401 });
  }

  const draft = truthy(request.headers.get("x-hibou-book-draft"));
  const [chapters, configuration] = await Promise.all([
    getRecords(TABLES.book, { pageSize: 100 }),
    getRecords(TABLES.configuration, { pageSize: 100 }),
  ]);
  const config = configMap(configuration);
  const edition = config.book_current_edition || "V1.0-draft";
  const populated = chapters.filter((record) => String(record.fields?.["Contenu V1"] || "").trim());
  const notReady = chapters.filter((record) => !chapterReady(record));

  if (!chapters.length) return new Response("Livre introuvable", { status: 404 });
  if (!draft && notReady.length) {
    return Response.json({
      ok: false,
      error: "book_not_ready",
      edition,
      total_chapters: chapters.length,
      ready_chapters: chapters.length - notReady.length,
      blockers: notReady.map((record) => ({
        id: record.id,
        chapter: record.fields?.Chapitre || "",
        status: record.fields?.Statut?.name || record.fields?.Statut || "",
        qc: record.fields?.["QC éditorial"] || "",
        human: record.fields?.["Validation humaine"] === true,
        ready_export: record.fields?.["Prêt export"] === true,
        has_content: Boolean(String(record.fields?.["Contenu V1"] || "").trim()),
      })),
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (draft && !populated.length) return new Response("Aucun chapitre généré", { status: 409 });

  const html = renderBookDocument({
    chapters,
    edition,
    generatedAt: new Date().toISOString(),
  });
  const safeEdition = String(edition).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "draft";
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="le-hibou-ruse-${safeEdition}.html"`,
      "Cache-Control": "no-store, private, max-age=0",
      "X-Hibou-Book-Edition": edition,
      "X-Hibou-Book-Draft": draft ? "true" : "false",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
