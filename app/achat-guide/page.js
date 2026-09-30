import Brand from "../../components/Brand";
import DigitalSupplyConsentForm from "../../components/DigitalSupplyConsentForm";
import { configMap, getAllRecords, TABLES } from "../../lib/airtable";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Acheter le guide", alternates: { canonical: "/achat-guide" }, robots: { index: false, follow: false } };

export default async function PurchasePage() {
  const records = await getAllRecords(TABLES.configuration, { maxRecords: 500 });
  const config = configMap(records);
  const mode = String(config.digital_supply_consent_checkout_mode || "disabled").trim().toLowerCase();
  const safeMode = ["test", "live"].includes(mode) ? mode : "disabled";

  return (
    <main className="legal">
      <Brand />
      <article>
        <p className="eyebrow dark"><span /> Guide numérique</p>
        <h1>Avant le paiement</h1>
        <p>L’offre porte sur l’édition actuellement disponible du guide numérique, une version en accès anticipé incomplète. Les sections sans texte ne sont pas comprises. Une version enrichie du même guide remplacera cette édition dans votre accès lorsqu’elle sera publiée, sans nouvel achat et sans date annoncée.</p>
        <p>Le guide est destiné à être fourni dans le lecteur sécurisé du Hibou Rusé après confirmation du paiement. Le parcours ci-dessous recueille séparément votre demande de commencement immédiat et votre reconnaissance de la conséquence correspondante sur le droit de rétractation, lorsque les conditions légales applicables sont réunies.</p>
        <DigitalSupplyConsentForm mode={safeMode} />
        <p><a className="text-link" href="/cgv">Lire les conditions générales de vente</a></p>
      </article>
    </main>
  );
}
