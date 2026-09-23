import LegalPage from "../../components/LegalPage";
import WithdrawalForm from "../../components/WithdrawalForm";

export const metadata = {
  title: "Rétractation",
  alternates: { canonical: "/retractation" },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <LegalPage title="Informations sur la rétractation">
    <p>Le guide Le Hibou Rusé est un contenu numérique fourni immédiatement après confirmation du paiement.</p>
    <p><strong>Lorsque le checkout a valablement recueilli votre consentement exprès au commencement immédiat de la fourniture et votre reconnaissance de la perte du droit de rétractation, puis qu’une confirmation correspondante vous a été fournie sur support durable, le droit de rétractation de 14 jours n’est plus applicable à cette fourniture numérique commencée.</strong></p>
    <p>Cette page reste disponible comme canal de déclaration lorsque vous estimez qu’un droit de rétractation subsiste malgré tout. Le dépôt d’une demande ne vaut ni reconnaissance automatique de l’existence de ce droit, ni promesse de remboursement.</p>
    <p>Pour identifier le contrat, indiquez votre nom, votre prénom, la référence de commande ou du contrat et le moyen électronique auquel vous souhaitez recevoir l’accusé de réception.</p>
    <WithdrawalForm />
    <p>Une copie téléchargeable de votre déclaration est générée immédiatement après l’envoi. Le traitement d’une demande dépend ensuite des droits effectivement applicables au contrat concerné.</p>
  </LegalPage>;
}
