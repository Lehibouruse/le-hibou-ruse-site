import Brand from "../../components/Brand";

export const metadata = { title: "Merci" };

export default function ThankYouPage() {
  return (
    <main className="legal thank-you">
      <Brand />
      <article>
        <p className="eyebrow dark"><span /> Paiement confirmé</p>
        <h1>Merci. Votre accès au guide est en cours d’activation.</h1>
        <p>Le reçu de paiement est envoyé à l’adresse utilisée lors de l’achat. L’accès au guide est créé séparément pour cette même adresse dans notre lecteur sécurisé.</p>
        <p>Vous recevez ensuite votre accès nominatif au guide par e-mail. Le PDF maître n’est jamais exposé publiquement et le lien d’un autre acheteur ne doit pas être utilisé.</p>
        <p>Si l’e-mail d’accès n’apparaît pas, vérifiez les courriers indésirables et conservez votre reçu : l’identifiant de commande permet de retrouver la livraison sans racheter le guide.</p>
        <a className="button" href="/">Retour au site</a>
      </article>
    </main>
  );
}
