import Brand from "../../components/Brand";
import TrackedLink from "../../components/TrackedLink";
import { configMap, getAllRecords, getRecords, TABLES } from "../../lib/airtable";
import { commercialReadiness } from "../../lib/launch-readiness.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Le guide — fiscalité, argent et patrimoine",
  description: "Découvrez la méthode du guide Le Hibou Rusé : mécanismes, conditions, exemples chiffrés et risques D4 à D6. Édition en préparation.",
  alternates: { canonical: "/guide" },
};

export default async function GuidePage() {
  const [products, configuration, chapters, legal] = await Promise.all([
    getRecords(TABLES.products),
    getAllRecords(TABLES.configuration, { maxRecords: 500 }).catch(() => []),
    getRecords(TABLES.book),
    getRecords(TABLES.legal),
  ]);
  const config = configMap(configuration);
  const product = products.find((record) => record.fields.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters, legal });
  const consentMode = String(config.digital_supply_consent_checkout_mode || "disabled").trim().toLowerCase();
  const consentEnabled = ["test", "live"].includes(consentMode);
  const purchaseUrl = readiness.checkoutUrl ? (consentEnabled ? "/achat-guide" : readiness.checkoutUrl) : "";

  return <main className="legal">
    <Brand />
    <div className="eyebrow dark"><span /> Guide numérique</div>
    <h1>Comprendre les mécanismes avant d’agir.</h1>
    <p className="article-summary">Le guide du Hibou Rusé explore des montages touchant à la fiscalité, à l’entreprise, au crédit et au patrimoine. Chaque scénario doit être lu avec ses hypothèses, ses conditions et ses risques.</p>
    <div className="legal-copy">
      <h2>Ce que vous pourrez examiner</h2>
      <ul>
        <li>Le mécanisme : quelles règles interagissent et dans quel ordre.</li>
        <li>Les conditions : les faits et justificatifs qui changent le résultat.</li>
        <li>Les chiffres : ce que montre un exemple et ce qu’il ne permet pas de conclure.</li>
        <li>Les limites : les situations où le montage échoue, et les points à faire valider.</li>
      </ul>
      <h2>Une grille de lecture D4 à D6</h2>
      <p>D4 désigne les scénarios les plus documentés ; D5 et D6 demandent une vigilance croissante sur les faits, la rédaction et l’interprétation. Ces niveaux décrivent la méthode éditoriale du Hibou, pas une garantie de résultat.</p>
      <h2>État de l’édition</h2>
      {!purchaseUrl && <p>Le manuscrit est encore en cours de vérification et de finalisation. Un sommaire définitif et un extrait du texte seront affichés ici lorsqu’ils auront été relus. Aucun achat n’est possible depuis cette page actuellement.</p>}
      {purchaseUrl && <p>Le guide est disponible. Le prix total, les conditions de vente et les modalités d’accès sont présentés avant validation du paiement.</p>}
      <p>Les contenus sont pédagogiques et ne remplacent pas une analyse juridique, fiscale ou financière individualisée par un professionnel compétent.</p>
    </div>
    {purchaseUrl && <TrackedLink event={consentEnabled ? "purchase_consent_opened" : "checkout_opened"} className="button" href={purchaseUrl}>Accéder au parcours d’achat</TrackedLink>}
    <p><a className="text-back" href="/">← Retour à l’accueil</a></p>
  </main>;
}
