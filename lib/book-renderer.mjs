import { BOOK_LEGAL_NOTICE } from "./book-editorial.mjs";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function headingClass(text) {
  const key = String(text || "").toLowerCase();
  if (key.includes("scène") || key.includes("histoire")) return "scene";
  if (key.includes("œil du hibou") || key.includes("oeil du hibou")) return "owl-eye";
  if (key.includes("ligne rouge")) return "red-line";
  if (key.includes("à vérifier") || key.includes("a verifier")) return "verify";
  if (key.includes("version robuste")) return "robust";
  if (key.includes("niveau d4") || key.includes("niveau d5") || key.includes("niveau d6")) return "risk";
  return "";
}

export function markdownToBookHtml(markdown = "") {
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    output.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.min(4, heading[1].length + 1);
      const text = heading[2].trim();
      const cls = headingClass(text);
      output.push(`<h${level}${cls ? ` class="${cls}"` : ""}>${inlineMarkdown(text)}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line)) { flushParagraph(); flushList(); output.push("<hr />"); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { flushParagraph(); list.push(bullet[1]); continue; }
    if (/^>\s*/.test(line)) {
      flushParagraph(); flushList();
      output.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s*/, ""))}</blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return output.join("\n");
}

export function chapterRank(title = "") {
  const normalized = String(title).trim().toLowerCase();
  if (normalized.startsWith("ouverture")) return 0;
  const number = normalized.match(/^(\d+)\s*[—-]/);
  if (number) return Number(number[1]) * 10 + (normalized.includes("suite technique") ? 1 : 0);
  if (normalized.startsWith("annexe")) return 9000;
  if (normalized.startsWith("conclusion")) return 10000;
  return 8000;
}

export function isBookChapter(record) {
  const title = String(record?.fields?.Chapitre || "").trim().toLowerCase();
  return title.startsWith("ouverture") || title.startsWith("conclusion")
    || title.startsWith("annexe") || /^\d+\s*[—-]/.test(title);
}

export function chapterContent(fields = {}) {
  const primary = String(fields["Contenu V1"] || "").trim();
  const continuation = String(fields["Contenu V1 — suite"] || "").trim();
  return [primary, continuation && !primary.includes(continuation) ? continuation : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function publishedBookChapters(chapters = []) {
  const available = chapters.filter((record) => isBookChapter(record) && Boolean(chapterContent(record.fields)))
    .sort((a, b) => chapterRank(a.fields?.Chapitre) - chapterRank(b.fields?.Chapitre));
  const merged = [];
  for (const record of available) {
    const title = String(record.fields?.Chapitre || "").trim();
    const mainTitle = title.replace(/\s*[—-]\s*suite technique$/i, "");
    if (mainTitle !== title) {
      const main = merged.find((item) => String(item.fields?.Chapitre || "").trim() === mainTitle);
      if (main) {
        main.fields["Contenu V1"] = `${chapterContent(main.fields)}\n\n${chapterContent(record.fields)}`;
        main.fields["Contenu V1 — suite"] = "";
        continue;
      }
    }
    merged.push({ ...record, fields: { ...record.fields } });
  }
  return merged;
}

export function bookStyles() {
  return `
  :root{--ink:#151515;--muted:#666;--paper:#f7f3e9;--panel:#fffdf7;--line:#d8d0bd;--dark:#11110f;--accent:#9a7a38;--red:#7b2525;--reader-font-size:17.5px;}
  *{box-sizing:border-box} html{background:#d8d4ca} body{margin:0;color:var(--ink);background:var(--paper);font-family:Georgia,'Times New Roman',serif;line-height:1.62;-webkit-font-smoothing:antialiased}
  .book{max-width:820px;margin:32px auto;background:var(--panel);box-shadow:0 18px 70px rgba(0,0,0,.15)}
  .cover{min-height:1080px;padding:92px 76px;display:flex;flex-direction:column;justify-content:space-between;background:var(--dark);color:#f8f1df;page-break-after:always}
  .cover-mark{font:700 13px/1.2 ui-sans-serif,system-ui;letter-spacing:.24em;text-transform:uppercase;color:#cfb779}.cover h1{font-size:68px;line-height:.96;letter-spacing:-.04em;margin:0;max-width:630px}.cover .subtitle{font-size:23px;max-width:580px;color:#d8d0bd}.cover .edition{font:500 13px ui-sans-serif,system-ui;color:#a8a08f;text-transform:uppercase;letter-spacing:.12em}
  .frontmatter{padding:72px 76px;page-break-after:always;scroll-margin-top:72px}.frontmatter h2{font-size:36px;margin:0 0 28px}.toc{columns:1;padding:0;list-style:none}.toc li{border-bottom:1px solid var(--line)}.toc a{display:flex;gap:16px;padding:11px 0;color:inherit;text-decoration:none}.toc a:hover .toc-title{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:3px}.toc a:focus-visible,.chapter-back:focus-visible{outline:3px solid rgba(154,122,56,.32);outline-offset:3px}.toc-number{font:700 11px ui-sans-serif,system-ui;letter-spacing:.12em;color:var(--accent);min-width:42px}.toc-title{font-size:16px}
  .chapter{padding:82px 76px;page-break-before:always;scroll-margin-top:72px}.chapter:first-of-type{page-break-before:auto}.chapter-kicker{font:700 11px ui-sans-serif,system-ui;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}.chapter>h1{font-size:43px;line-height:1.07;letter-spacing:-.025em;margin:0 0 42px}.chapter-body{max-width:66ch;margin-inline:auto;font-size:var(--reader-font-size);line-height:1.72;overflow-wrap:anywhere}.chapter-body h2{font-size:1.7em;line-height:1.15;margin:56px 0 18px}.chapter-body h3{font-size:1.2em;line-height:1.25;margin:38px 0 12px;scroll-margin-top:84px}.chapter-body h4{font:800 .72em/1.3 ui-sans-serif,system-ui;letter-spacing:.11em;text-transform:uppercase;margin:27px 0 9px}.chapter-body p{font-size:1em;margin:0 0 20px}.chapter-body ul{font-size:.98em;padding-left:24px}.chapter-body li{margin:8px 0}.chapter-body hr{border:0;border-top:1px solid var(--line);margin:46px 0}.chapter-body blockquote{margin:30px 0;padding:22px 26px;border-left:4px solid var(--accent);background:#f0eadc;font-size:1.08em;font-style:italic}
  .chapter-body h3.scene,.chapter-body h4.scene{color:#6d592c}.chapter-body h3.red-line,.chapter-body h4.red-line{color:var(--red)}.chapter-body h3.verify,.chapter-body h4.verify,.chapter-body h3.owl-eye,.chapter-body h4.owl-eye,.chapter-body h3.robust,.chapter-body h4.robust,.chapter-body h3.risk,.chapter-body h4.risk{padding:14px 17px;margin-left:-17px;margin-right:-17px;background:#f2ecde;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .empty{padding:22px;border:1px dashed #aaa;color:var(--muted);font:14px ui-sans-serif,system-ui}.legal-note{font:13px/1.55 ui-sans-serif,system-ui;color:var(--muted);border-top:1px solid var(--line);margin-top:58px;padding-top:18px}.chapter-back{display:inline-block;margin-top:18px;color:#6d592c;font:700 12px/1.4 ui-sans-serif,system-ui;text-underline-offset:3px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eee8d9;padding:1px 4px;border-radius:3px}
  @page{size:6in 9in;margin:17mm 16mm 18mm} @media print{html,body{background:white}.book{max-width:none;margin:0;box-shadow:none}.cover,.frontmatter,.chapter{min-height:auto;padding:0}.cover{height:8.25in;padding:12mm}.frontmatter,.chapter{padding:0}}
  @media(max-width:700px){.book{margin:0}.cover,.frontmatter,.chapter{padding:54px 28px}.cover{min-height:100vh}.cover h1{font-size:48px}.chapter>h1{font-size:34px}}
  `;
}

export function renderBookDocument({ chapters = [], edition = "V1.0-draft", generatedAt = new Date().toISOString(), publishedReader = false, updatedSincePurchase = false }) {
  const available = publishedReader ? publishedBookChapters(chapters) : chapters;
  const sorted = [...available].sort((a, b) => chapterRank(a.fields?.Chapitre) - chapterRank(b.fields?.Chapitre));
  const toc = sorted.map((record, index) => `<li><a href="#chapter-${index + 1}"><span class="toc-number">${String(index + 1).padStart(2, "0")}</span><span class="toc-title">${escapeHtml(record.fields?.Chapitre || "Sans titre")}</span></a></li>`).join("");
  const body = sorted.map((record, index) => {
    const fields = record.fields || {};
    const content = chapterContent(fields);
    return `<section class="chapter" id="chapter-${index + 1}" data-reader-title="${escapeHtml(fields.Chapitre || "Sans titre")}"><div class="chapter-kicker">${escapeHtml(fields.Section?.name || fields.Section || `Chapitre ${index + 1}`)}</div><h1>${escapeHtml(fields.Chapitre || "Sans titre")}</h1><div class="chapter-body">${content ? markdownToBookHtml(content) : '<div class="empty">Chapitre en cours de génération.</div>'}</div><div class="legal-note">${escapeHtml(BOOK_LEGAL_NOTICE)}</div><a class="chapter-back" href="#sommaire">Retour au sommaire</a></section>`;
  }).join("\n");
  const editionNotice = publishedReader
    ? `<section class="frontmatter"><div class="cover-mark">ÉDITION ACTUELLE</div><h2>Le contenu que vous consultez</h2><p>Ce sommaire liste uniquement les textes disponibles dans l’édition ${escapeHtml(edition)}. Les sections encore sans texte ne font pas partie de cette édition.</p>${updatedSincePurchase ? "<p>Le contenu de ce guide a été mis à jour depuis votre achat ; la version affichée remplace celle initialement disponible.</p>" : ""}<p>Lorsqu’une version enrichie du même guide sera publiée, elle remplacera l’édition actuelle dans votre accès sans nouvel achat. Aucune date ni quantité de nouveaux chapitres n’est annoncée.</p><p>Les passages marqués « À VÉRIFIER » restent visibles pour signaler les points qui demandent une vérification. Ces analyses pédagogiques ne remplacent pas l’avis d’un professionnel compétent.</p></section>`
    : "";
  const label = publishedReader ? `consultée le ${escapeHtml(generatedAt.slice(0,10))}` : `preview privée · ${escapeHtml(generatedAt.slice(0,10))}`;
  const title = publishedReader ? `Le Guide du Hibou Rusé — édition ${escapeHtml(edition)}` : "Le Guide du Hibou Rusé — preview";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow,noarchive"/><title>${title}</title><style>${bookStyles()}</style></head><body><main class="book"><section class="cover"><div class="cover-mark">LE HIBOU RUSÉ</div><div><h1>Le guide du <br/>Hibou Rusé</h1><p class="subtitle">Comprendre les mécanismes. Vérifier les conditions. Mesurer les risques.</p></div><div class="edition">Édition ${escapeHtml(edition)} · ${label}</div></section><section class="frontmatter" id="sommaire"><div class="cover-mark">SOMMAIRE</div><h2>Les textes de cette édition.</h2><ol class="toc">${toc}</ol></section>${editionNotice}${body}</main></body></html>`;
}
