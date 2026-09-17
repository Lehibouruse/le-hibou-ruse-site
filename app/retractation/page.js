import LegalPage from "../../components/LegalPage";
import WithdrawalForm from "../../components/WithdrawalForm";

export const metadata = {
  title: "Rétractation",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <LegalPage title="Renoncer au contrat ici">
    <p>Cette fonctionnalité permet d’envoyer en ligne une déclaration de rétractation concernant un contrat conclu avec Le Hibou Rusé. Elle reste accessible indépendamment du service client.</p>
    <p>Pour identifier le contrat, indiquez votre nom, votre prénom, la référence de commande ou du contrat et le moyen électronique auquel vous souhaitez recevoir l’accusé de réception.</p>
    <p><strong>Contenu numérique :</strong> lorsque l’exécution d’un contenu numérique sans support matériel a commencé avant la fin du délai de rétractation avec les consentements et confirmations légalement requis, le droit de rétractation peut avoir été perdu. Le dépôt du formulaire reste enregistré mais ne vaut donc pas reconnaissance automatique de l’existence du droit, ni décision de remboursement.</p>
    <WithdrawalForm />
    <p>Une copie téléchargeable de votre déclaration est générée immédiatement après l’envoi. Le dispositif d’envoi d’un accusé sur support durable doit également être validé avant l’ouverture commerciale définitive.</p>
  </LegalPage>;
}
