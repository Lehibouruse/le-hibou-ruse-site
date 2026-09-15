export const FINALIZER_VERSION = "HIBOU_BOOK_FINALIZER_V1";

const SPECIAL = [
  { kind: "opening", prefix: "Ouverture —", minChars: 6500 },
  { kind: "red_lines", prefix: "Annexe — Les lignes rouges", minChars: 12000 },
  { kind: "conclusion", prefix: "Conclusion —", minChars: 4500 },
];

function text(value) { return String(value ?? "").trim(); }
function selectName(value) { return value?.name || value || ""; }

export function corpusChapters(records = []) {
  return records
    .filter((record) => /^\d+\s+—/.test(text(record?.fields?.Chapitre)))
    .sort((a, b) => Number(text(a.fields.Chapitre).match(/^\d+/)?.[0] || 999) - Number(text(b.fields.Chapitre).match(/^\d+/)?.[0] || 999));
}

function expectedCount(record) {
  const start = Number(record?.fields?.["Source début"]);
  const end = Number(record?.fields?.["Source fin"]);
  return Number.isInteger(start) && Number.isInteger(end) && end >= start ? end - start + 1 : 0;
}

export function corpusReady(records = []) {
  const chapters = corpusChapters(records);
  if (chapters.length !== 13) return { ready: false, chapters, reason: `chapters=${chapters.length}/13` };
  for (const chapter of chapters) {
    const body = text(chapter.fields?.["Contenu V1"]);
    const expected = expectedCount(chapter);
    const covered = Number(chapter.fields?.["Montages couverts"] || 0);
    const qc = text(chapter.fields?.["QC éditorial"]).toLowerCase();
    if (!body || !expected || covered !== expected || ["", "fail", "in_progress"].includes(qc)) {
      return { ready: false, chapters, reason: `${text(chapter.fields?.Chapitre)}:${covered}/${expected}:qc=${qc || "empty"}` };
    }
  }
  return { ready: true, chapters, reason: "13/13 corpus chapters assembled" };
}

export function nextSpecialTarget(records = []) {
  for (const spec of SPECIAL) {
    const record = records.find((item) => text(item?.fields?.Chapitre).startsWith(spec.prefix));
    if (!record) continue;
    if (!text(record.fields?.["Contenu V1"])) return { ...spec, record };
  }
  return null;
}

export function chapterDigests(chapters = []) {
  return chapters.map((chapter) => {
    const body = text(chapter.fields?.["Contenu V1"]);
    return {
      chapter: text(chapter.fields?.Chapitre),
      section: selectName(chapter.fields?.Section),
      notes: text(chapter.fields?.Notes),
      qc: text(chapter.fields?.["Notes QC"]).slice(0, 1400),
      opening_excerpt: body.slice(0, 2800),
      closing_excerpt: body.slice(-2800),
      characters: body.length,
      montages: Number(chapter.fields?.["Montages couverts"] || 0),
    };
  });
}

export function extractD6Cases(chapters = [], limit = 24) {
  const cases = [];
  for (const chapter of chapters) {
    const body = text(chapter.fields?.["Contenu V1"]);
    const blocks = body.split(/\n(?=##\s+\d+\.)/g);
    for (const block of blocks) {
      const level = block.match(/### Niveau D4 \/ D5 \/ D6\s*\n([\s\S]*?)(?=\n### |\n## |$)/i)?.[1] || "";
      if (!/\bD6\b/i.test(level)) continue;
      const title = block.match(/^##\s+([^\n]+)/m)?.[1] || "Cas D6";
      const scene = block.match(/### La scène\s*\n([\s\S]*?)(?=\n### |$)/i)?.[1] || "";
      const fall = block.match(/### Ce qui peut faire tomber le montage\s*\n([\s\S]*?)(?=\n### |$)/i)?.[1] || "";
      const robust = block.match(/### Version robuste\s*\n([\s\S]*?)(?=\n### |$)/i)?.[1] || "";
      cases.push({ chapter: text(chapter.fields?.Chapitre), title, level: text(level).slice(0, 1400), scene: text(scene).slice(0, 1200), failure: text(fall).slice(0, 1600), robust: text(robust).slice(0, 1600) });
      if (cases.length >= limit) return cases;
    }
  }
  return cases;
}

export function finalizerInstructions(kind) {
  const shared = `Tu es l'auteur-rédacteur final du livre payant Le Hibou Rusé. Écris en français, premium, vif, intelligent, parfois provocateur mais toujours exact. Aucun H1 : la maquette ajoute le titre. Paragraphes courts. Aucun méta-commentaire. N'invente aucun texte de loi, taux, jurisprudence, plafond ou chiffre absent des éléments fournis. Si une précision manque, formule le principe sans inventer ou marque [À VÉRIFIER]. Le livre est pédagogique et ne promet jamais qu'un montage est adapté à un lecteur réel.`;
  if (kind === "opening") return `${shared}\n\nÉcris l'ouverture du livre (environ 1 800 à 2 400 mots). Elle doit expliquer la philosophie : voir les interactions que les contenus classiques isolent, distinguer règle/réalité/preuve, présenter D4/D5/D6 sans glorifier l'illégalité, expliquer comment lire les scènes, gains, risques et versions robustes. Donne envie de lire sans faire de promesse magique. Ne résume pas mécaniquement les 13 chapitres.`;
  if (kind === "conclusion") return `${shared}\n\nÉcris la conclusion (environ 1 400 à 1 900 mots). Fais ressortir les leçons transversales du corpus : qualification, substance, prix, chronologie, preuve, scénario adverse et variante robuste. Termine sur l'idée qu'être agressif dans l'analyse exige d'être rigoureux dans les faits. Pas de nouveau montage, pas de CTA commercial.`;
  return `${shared}\n\nÉcris l'annexe « lignes rouges » (environ 3 500 à 5 000 mots). À partir uniquement des cas D6 extraits et des deux sources finales fournies, construis des catégories de rupture : simulation, faux document, fausse qualité, détournement d'aide, dissimulation, double financement, absence de substance, etc. Pour chaque catégorie : micro-scène NON OPÉRATIONNELLE, raison de la rupture, indices de détection, conséquences générales, puis alternative légale/robuste. INTERDICTION ABSOLUE de donner une séquence d'étapes, des techniques de dissimulation, des moyens d'éviter un contrôle, de fabriquer une preuve ou de tromper une administration. L'annexe doit décourager la fraude tout en montrant la frontière intellectuelle avec l'optimisation agressive.`;
}

export function specialQuality(kind, output) {
  const spec = SPECIAL.find((item) => item.kind === kind);
  const body = text(output);
  const issues = [];
  if (!spec) issues.push("kind inconnu");
  if (body.length < (spec?.minChars || 4000)) issues.push(`texte trop court: ${body.length}`);
  if (/^#\s+/m.test(body)) issues.push("H1 interdit");
  if (kind === "red_lines" && !/D6|ligne rouge|fraude|simulation/i.test(body)) issues.push("annexe sans marqueur ligne rouge");
  return { pass: issues.length === 0, issues, characters: body.length };
}
