const REQUIRED_HEADINGS = [
  "La scène",
  "Ce qui se passe vraiment",
  "Le mécanisme",
  "Ce que dit la règle",
  "Le gain potentiel",
  "Niveau D4 / D5 / D6",
  "Ce qui peut faire tomber le montage",
  "À vérifier",
  "Version robuste",
];

function countMatches(text, pattern) {
  return [...String(text || "").matchAll(pattern)].length;
}

export function bookQualityGate(text, { expectedMontages = 0, firstPart = true } = {}) {
  const content = String(text || "").replaceAll("\r\n", "\n").trim();
  const montageCount = countMatches(content, /^##\s+\d+\.\s+.+$/gm);
  const verifyMarkers = countMatches(content, /\[À VÉRIFIER\]/g);
  const h1Count = countMatches(content, /^#\s+.+$/gm);
  const headingCounts = Object.fromEntries(REQUIRED_HEADINGS.map((heading) => [heading, countMatches(content, new RegExp(`^###\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "gm"))]));
  const failures = [];
  const warnings = [];

  if (!content) failures.push("contenu vide");
  if (expectedMontages > 0 && montageCount !== expectedMontages) failures.push(`montages=${montageCount}/${expectedMontages}`);
  if (h1Count > 0) failures.push(`H1 parasite=${h1Count}`);
  if (expectedMontages > 0 && content.length < expectedMontages * 900) failures.push(`contenu trop court=${content.length} caractères`);

  for (const heading of REQUIRED_HEADINGS) {
    const count = headingCounts[heading];
    if (expectedMontages > 0 && count !== expectedMontages) failures.push(`${heading}=${count}/${expectedMontages}`);
  }

  if (firstPart) {
    const firstMontage = content.search(/^##\s+\d+\.\s+/m);
    if (firstMontage >= 0 && firstMontage < 500) warnings.push("ouverture de chapitre courte");
  }
  if (verifyMarkers > Math.max(6, expectedMontages)) warnings.push(`beaucoup de [À VÉRIFIER]: ${verifyMarkers}`);

  return {
    pass: failures.length === 0,
    montageCount,
    characters: content.length,
    verifyMarkers,
    h1Count,
    headingCounts,
    failures,
    warnings,
    notes: [...failures.map((item) => `FAIL: ${item}`), ...warnings.map((item) => `WARN: ${item}`)].join("\n") || "PASS: structure complète",
  };
}

export { REQUIRED_HEADINGS };
