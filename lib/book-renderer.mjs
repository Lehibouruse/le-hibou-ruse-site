import { bookContent } from "./book-content.mjs";

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
  if (number) return Number(number[1]) * 10;
  if (normalized.startsWith("annexe")) return 9000;
  if (normalized.startsWith("conclusion")) return 10000;
  return 8000;
}

export function bookStyles() {
  return `
  :root{--ink:#151515;--muted:#666;--paper:#f7f3e9;--panel:#fffdf7;--line:#d8d0bd;--dark:#11110f;--accent:#9a7a38;--red:#7b2525;}
  *{box-sizing:border-box} html{background:#d8d4ca} body{margin:0;color:var(--ink);background:var(--paper);font-family:Georgia,'Times New Roman',serif;line-height:1.62;-webkit-font-smoothing:antialiased}
  .book{max-width:820px;margin:32px auto;background:var(--panel);box-shadow:0 18px 70px rgba(0,0,0,.15)}
  .cover{min-height:1080px;padding:92px 76px;display:flex;flex-direction:column;justify-content:space-between;background:var(--dark);color:#f8f1df;page-break-after:always}
  .cover-mark{font:700 13px/1.2 ui-sans-serif,system-ui;letter-spacing:.24em;text-transform:uppercase;color:#cfb779}.cover h1{font-size:68px;line-height:.96;letter-spacing:-.04em;margin:0;max-width:630px}.cover .subtitle{font-size:23px;max-width:580px;color:#d8d0bd}.cover .edition{font:500 13px ui-sans-serif,system-ui;color:#a8a08f;text-transform:uppercase;letter-spacing:.12em}
  .frontmatter{padding:72px 76px;page-break-after:always}.frontmatter h2{font-size:36px;margin:0 0 28px}.toc{columns:1;padding:0;list-style:none}.toc li{display:flex;gap:16px;padding:9px 0;border-bottom:1px solid var(--line)}.toc span:first-child{font:700 11px ui-sans-serif,system-ui;letter-spacing:.12em;color:var(--accent);min-width:42px}.toc span:last-child{font-size:16px}
  .chapter{padding:82px 76px;page-break-before:always}.chapter:first-of-type{page-break-before:auto}.chapter-kicker{font:700 11px ui-sans-serif,system-ui;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}.chapter>h1{font-size:43px;line-height:1.07;letter-spacing:-.025em;margin:0 0 42px}.chapter-body h2{font-size:30px;line-height:1.15;margin:56px 0 18px}.chapter-body h3{font-size:21px;line-height:1.25;margin:34px 0 12px}.chapter-body h4{font:800 12px/1.3 ui-sans-serif,system-ui;letter-spacing:.11em;text-transform:uppercase;margin:27px 0 9px}.chapter-body p{font-size:17.5px;margin:0 0 18px}.chapter-body ul{font-size:17px;padding-left:24px}.chapter-body li{margin:7px 0}.chapter-body hr{border:0;border-top:1px solid var(--line);margin:46px 0}.chapter-body blockquote{margin:28px 0;padding:22px 26px;border-left:4px solid var(--accent);background:#f0eadc;font-size:19px;font-style:italic}
  .chapter-body h3.scene,.chapter-body h4.scene{color:#6d592c}.chapter-body h3.red-line,.chapter-body h4.red-line{color:var(--red)}.chapter-body h3.verify,.chapter-body h4.verify,.chapter-body h3.owl-eye,.chapter-body h4.owl-eye,.chapter-body h3.robust,.chapter-body h4.robust,.chapter-body h3.risk,.chapter-body h4.risk{padding:14px 17px;margin-left:-17px;margin-right:-17px;background:#f2ecde;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .empty{padding:22px;border:1px dashed #aaa;color:var(--muted);font:14px ui-sans-serif,system-ui}.legal-note{font:13px/1.55 ui-sans-serif,system-ui;color:var(--muted);border-top:1px solid var(--line);margin-top:58px;padding-top:18px}.folio{font:11px ui-sans-serif,system-ui;color:#888;text-align:center;margin-top:52px;letter-spacing:.12em;text-transform:uppercase}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eee8d9;padding:1px 4px;border-radius:3px}
  @page{size:6in 9in;margin:17mm 16mm 18mm} @media print{html,body{background:white}.book{max-width:none;margin:0;box-shadow:none}.cover,.frontmatter,.chapter{min-height:auto;padding:0}.cover{height:8.25in;padding:12mm}.frontmatter,.chapter{padding:0}.folio{position:running(footer)}}
  @media(max-width:700px){.book{margin:0}.cover,.frontmatter,.chapter{padding:54px 28px}.cover{min-height:100vh}.cover h1{font-size:48px}.chapter>h1{font-size:34px}}
  `;
}

export function renderBookDocument({ chapters = [], edition = "V1.0-draft", generatedAt = new Date().toISOString() }) {
  const sorted = [...chapters].sort((a, b) => chapterRank(a.fields?.Chapitre) - chapterRank(b.fields?.Chapitre));
  const toc = sorted.map((record, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(record.fields?.Chapitre || "Sans titre")}</span></li>`).join("");
  const body = sorted.map((record, index) => {
    const fields = record.fields || {};
    const content = bookContent(fields);
    return `<section class="chapter"><div class="chapter-kicker">${escapeHtml(fields.Section?.name || fields.Section || `Chapitre ${index + 1}`)} · ${escapeHtml(fields.Version || "brouillon")}</div><h1>${escapeHtml(fields.Chapitre || "Sans titre")}</h1><div class="chapter-body">${content ? markdownToBookHtml(content) : '<div class="empty">Chapitre en cours de génération.</div>'}</div><div class="legal-note">Contenu pédagogique et informatif. Les règles évoluent ; les passages signalés « À VÉRIFIER » doivent être actualisés avant publication. Les exemples fictifs ne constituent pas un conseil juridique, fiscal ou financier individualisé.</div><div class="folio">Le Hibou Rusé · ${escapeHtml(edition)}</div></section>`;
  }).join("\n");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow,noarchive"/><title>Le Guide du Hibou Rusé — preview</title><style>${bookStyles()}</style></head><body><main class="book"><section class="cover"><div class="cover-mark">LE HIBOU RUSÉ</div><div><h1>Le guide du<br/>Hibou Rusé</h1><p class="subtitle">Comprendre les règles. Exploiter les failles. Mesurer le risque.</p></div><div class="edition">Édition ${escapeHtml(edition)} · preview privée · ${escapeHtml(generatedAt.slice(0,10))}</div></section><section class="frontmatter"><div class="cover-mark">SOMMAIRE</div><h2>Voir ce que les autres ne regardent pas.</h2><ol class="toc">${toc}</ol></section>${body}</main></body></html>`;
}
