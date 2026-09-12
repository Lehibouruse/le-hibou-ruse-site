export const metadata = { title: "Merci — Le Hibou Rusé" };

export default function ThankYouPage() {
  return (
    <main className="legal-page">
      <a className="brand" href="/"><img src="/hibou.svg" alt="" />Le Hibou Rusé</a>
      <article>
        <p className="eyebrow dark"><span /> Commande confirmée</p>
        <h1>Merci pour votre confiance.</h1>
        <p>Votre reçu et le lien sécurisé de téléchargement sont envoyés par e-mail par notre prestataire de paiement.</p>
        <p>Si le message n’apparaît pas après quelques minutes, vérifiez les courriers indésirables puis utilisez l’adresse de support indiquée sur votre reçu.</p>
        <a className="button" href="/">Retour au site</a>
      </article>
    </main>
  );
}
