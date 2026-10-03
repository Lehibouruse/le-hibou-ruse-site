// Public merchandising helpers. Never send whole Airtable records to the client.
import { chapterContent, publishedBookChapters } from './book-renderer.mjs';

export const BOOK_LANDING_VERSION = '2026-10-03-a';
export const SAMPLE_SPECS = [
  { number: 21, category: 'entreprise', kicker: 'CAPITALISER', title: 'La holding n’est pas votre portefeuille', promise: 'Et si votre argent travaillait avant de rejoindre votre compte personnel ?', chapter: 2 },
  { number: 62, category: 'entreprise', kicker: 'VALORISER', title: 'Vendre à sa société ce que l’on a créé seul', promise: 'Votre entreprise pourrait-elle vous acheter ce que vous avez créé ?', chapter: 4 },
  { number: 89, category: 'patrimoine', kicker: 'TRANSMETTRE', title: 'Donner la propriété sans rendre les clés', promise: 'Transmettre un bien. En conserver l’usage. Deux décisions, pas une seule.', chapter: 5 },
];

export function extractNumberedSection(content, number) {
  const text = String(content || '').replaceAll('\r\n', '\n');
  const sections = [...text.matchAll(/^##\s+(\d+)[.)]\s+(.+)$/gm)];
  const index = sections.findIndex((item) => Number(item[1]) === number);
  if (index < 0) return null;
  const item = sections[index];
  const end = sections[index + 1]?.index ?? text.length;
  return { number, title: item[2].trim(), markdown: text.slice(item.index + item[0].length, end).trim().replace(/\n---\s*$/, '').trim() };
}

export function plainExcerpt(markdown, limit = 700) {
  const paragraphs = String(markdown || '').split(/\n\s*\n/).filter((part) => part.trim() && !/^\s*(#|>|```|---)/.test(part));
  let result = '';
  for (const paragraph of paragraphs) {
    const clean = paragraph.replace(/\*\*|`/g, '').trim();
    if ((result + clean).length > limit) break;
    result += (result ? '\n\n' : '') + clean;
    if (result.length > 240) break;
  }
  return result;
}

export function publicBookModel(records = []) {
  const chapters = publishedBookChapters(records);
  const sections = chapters.map((record) => {
    const rawTitle = String(record.fields.Chapitre || '');
    const number = Number(rawTitle.match(/^(\d+)/)?.[1] || 0);
    const category = [1, 2, 4].includes(number) ? 'entreprise' : [6, 11].includes(number) ? 'remuneration' : [5, 7, 13].includes(number) ? 'patrimoine' : 'transversal';
    const entries = [...chapterContent(record.fields).matchAll(/^##\s+(\d+)[.)]\s+(.+)$/gm)].map((m) => ({ number: Number(m[1]), title: m[2].trim() }));
    return { title: rawTitle.replace(/^\d+\s*[—-]\s*/, ''), number, category, entries };
  });
  const samples = SAMPLE_SPECS.flatMap((spec) => {
    const record = chapters.find((item) => Number(String(item.fields.Chapitre).match(/^(\d+)/)?.[1]) === spec.chapter);
    if (!record) return [];
    const section = extractNumberedSection(chapterContent(record.fields), spec.number);
    if (!section) return [];
    return [{ ...spec, title: section.title, markdown: section.markdown, excerpt: plainExcerpt(section.markdown), sourceTitle: record.fields.Chapitre }];
  });
  return { sectionCount: sections.length, sections, samples };
}

// Fixed illustration, not a personal simulation. Base is a dividend AFTER the operating company's IS.
export function capitalIllustration(amount = 100000) {
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Invalid dividend amount');
  const personalTax = Math.round(amount * 0.314 * 100) / 100;
  const holdingTax = Math.round(amount * 0.05 * 0.25 * 100) / 100;
  const personal = amount - personalTax;
  const holding = amount - holdingTax;
  return { amount, personalTax, holdingTax, personal, holding, retainedDifference: holding - personal, afterPersonalDistribution: Math.round(holding * (1 - 0.314) * 100) / 100 };
}
