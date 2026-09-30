import Brand from "../../components/Brand";
import TrackedLink from "../../components/TrackedLink";
import { configMap, getAllRecords, getRecords, TABLES } from "../../lib/airtable";
import { commercialReadiness } from "../../lib/launch-readiness.mjs";
import { publishedBookChapters } from "../../lib/book-renderer.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Le guide — fiscalité, argent et patrimoine",
  description: "Découvrez l’édition actuelle en accès anticipé du guide Le Hibou Rusé, ses textes disponibles, ses limites et sa politique de mise à jour.",
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
  const availableChapters = publishedBookChapters(chapters);
  const edition = config.book_current_edition || "édition actuelle";
  const price = product["Prix €"] || config.ebook_price || 29;

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
      <h2>Édition actuellement proposée</h2>
      <p>L’édition <strong>{edition}</strong> est une version en accès anticipé, incomplète. {availableChapters.length > 0 ? `${availableChapters.length} textes sont actuellement compris dans le lecteur : l’ouverture, les chapitres rédigés et la conclusion. Les sections sans texte sont exclues.` : "La composition du guide n’est pas vérifiable pour le moment."} Ces textes sont encore des brouillons éditoriaux ; certains portent des mentions « À VÉRIFIER » et leurs analyses doivent être contrôlées avant toute mise en œuvre.</p>
      <p>L’achat porte sur cette édition disponible aujourd’hui. Lorsqu’une version enrichie du même guide sera publiée, elle remplacera l’édition actuelle dans votre accès, sans nouvel achat. Aucune date ni quantité de nouveaux chapitres n’est annoncée.</p>
      <p>Le prix annoncé est de <strong>{price} € en paiement unique</strong> ; le total exact et les taxes éventuelles sont indiqués avant validation chez Lemon Squeezy. Après paiement confirmé, l’accès personnel se fait dans le lecteur sécurisé du Hibou Rusé depuis la page de confirmation et le lien du reçu.</p>
      {!purchaseUrl && <p>Le paiement sur ce site reste suspendu jusqu’à validation du consentement, de la livraison et des informations nécessaires au lancement.</p>}
      <p>Les contenus sont pédagogiques et ne remplacent pas une analyse juridique, fiscale ou financière individualisée par un professionnel compétent.</p>
    </div>
    {purchaseUrl && <TrackedLink event={consentEnabled ? "purchase_consent_opened" : "checkout_opened"} className="button" href={purchaseUrl}>Accéder au parcours d’achat</TrackedLink>}
    <p><a className="text-back" href="/">← Retour à l’accueil</a></p>
  </main>;
}
