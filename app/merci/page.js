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
        <p>Le reçu de paiement est envoyé à l’adresse utilisée lors de l’achat. Selon le mode de livraison actif, l’accès est fourni dans le lecteur sécurisé du Hibou ou directement via Lemon Squeezy.</p>
        <p>Vous recevez également les informations d’accès par e-mail. Si l’activation prend quelques minutes, laissez cette page ouverte : elle se met à jour automatiquement. Ne rachetez pas le guide.</p>
        <a className="button secondary" href="/">Retour au site</a>
      </article>
    </main>
  );
}
