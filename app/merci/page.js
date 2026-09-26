import Brand from "../../components/Brand";
import PurchaseAccess from "../../components/PurchaseAccess";

export const metadata = { title: "Merci", robots: { index: false, follow: false } };

export default async function ThankYouPage({ searchParams }) {
  const params = await searchParams;
  const orderIdentifier = String(params?.order || "").trim();

  return (
    <main className="legal thank-you">
      <Brand />
      <article>
        <p className="eyebrow dark"><span /> Paiement confirmé</p>
        <h1>Merci. Votre guide arrive ici automatiquement.</h1>
        <PurchaseAccess orderIdentifier={orderIdentifier} />
        <p>Le reçu de paiement est envoyé à l’adresse utilisée lors de l’achat. Pour le mode protégé du Hibou, le PDF maître n’est jamais exposé : le bouton de lecture apparaît ici après validation du paiement.</p>
        <p>Conservez votre reçu Lemon Squeezy pour retrouver cette page. Si l’activation prend quelques instants, laissez cette page ouverte : elle se met à jour automatiquement. Ne rachetez pas le guide.</p>
        <a className="button secondary" href="/">Retour au site</a>
      </article>
    </main>
  );
}
