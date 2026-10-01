import { createHash } from "node:crypto";
import { chapterContent, chapterRank, publishedBookChapters } from "./book-renderer.mjs";

const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");

export function bookEditionManifest(chapters = [], edition = "") {
  const entries = publishedBookChapters(chapters).map((record) => {
    const fields = record.fields || {};
    const content = chapterContent(fields);
    return {
      title: String(fields.Chapitre || "Sans titre").trim(),
      version: String(fields.Version || "").trim(),
      characters: content.length,
      sha256: hash(content),
    };
  }).sort((a, b) => chapterRank(a.title) - chapterRank(b.title) || a.title.localeCompare(b.title, "fr"));
  const manifest = { schema: "HIBOU_BOOK_EDITION_MANIFEST_V1", edition: String(edition || "").trim(), entries };
  return { ...manifest, chapter_count: entries.length, sha256: hash(JSON.stringify(manifest)) };
}

export function bookEditionAuditNote(manifest) {
  if (!manifest?.chapter_count) return "";
  return `edition_manifest_sha256=${manifest.sha256}; edition_manifest_chapters=${manifest.chapter_count}; edition_manifest=${JSON.stringify(manifest.entries)}`;
}
