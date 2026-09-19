import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Conditions générales de vente" };

export default function Page() {
  return <LegalPage title="Conditions générales de vente">
    <p><strong>Version en vigueur : 19 septembre 2026.</strong></p>

    <h2>1. Produit</h2>
    <p>Le produit vendu est le guide numérique <strong>Le Hibou Rusé</strong>. L’édition actuellement proposée est une <strong>V1 en cours d’enrichissement</strong> : l’achat donne accès immédiatement à la version disponible au moment de la commande. Le contenu peut être complété ou corrigé ultérieurement.</p>
    <p>Le guide fournit une information générale et pédagogique. Il ne constitue pas un conseil juridique, fiscal, comptable, financier ou patrimonial individualisé.</p>

    <h2>2. Structure éditoriale</h2>
    <p>Le Hibou Rusé est un projet éditorial exploité avant immatriculation de sa structure dédiée. La structure envisagée est une <strong>LLC de droit du Nouveau-Mexique (États-Unis), en cours de formation et non encore immatriculée</strong>. Contact : <strong>contact@d4d5d6.fr</strong>.</p>

    <h2>3. Prix et paiement</h2>
    <p>Le prix du guide est de <strong>29 € en paiement unique</strong>, sous réserve du montant total et des taxes affichés dans le checkout. La transaction est traitée par <strong>Lemon Squeezy</strong>, qui agit comme <em>Merchant of Record</em>.</p>

    <h2>4. Fourniture</h2>
    <p>Après confirmation du paiement, un accès nominatif au guide est créé pour l’adresse e-mail utilisée lors de la commande via un lecteur sécurisé, actuellement Digify. Le téléchargement et l’impression peuvent être désactivés.</p>

    <h2>5. Rétractation</h2>
    <p>Pour un contenu numérique fourni immédiatement, la perte du droit de rétractation suppose notamment un consentement exprès au commencement de la fourniture avant la fin du délai légal, la reconnaissance de la perte du droit et la confirmation correspondante sur support durable. <strong>Tant que ces conditions ne sont pas valablement réunies et prouvées, les présentes ne prétendent pas supprimer un droit de rétractation légalement ouvert.</strong></p>

    <h2>6. Accès, support et remboursement</h2>
    <p>En cas de difficulté d’accès, le client peut écrire à <strong>contact@d4d5d6.fr</strong> avec sa référence de commande. Les remboursements, contestations et chargebacks sont traités conformément aux droits applicables et aux conditions de Lemon Squeezy en qualité de Merchant of Record.</p>

    <h2>7. Licence</h2>
    <p>L’achat confère un droit personnel, non exclusif et non transférable de consultation du guide. La revente, le partage public du lien d’accès et la diffusion substantielle du guide sont interdits sauf autorisation ou exception légale.</p>

    <h2>8. Évolution des informations</h2>
    <p>Les matières fiscales, juridiques, patrimoniales et financières peuvent évoluer. Les analyses doivent être appréciées à la date de leur consultation et vérifiées dans toute situation réelle.</p>

    <h2>9. Droits impératifs</h2>
    <p>Aucune clause des présentes ne limite un droit impératif du consommateur ni une garantie légale applicable.</p>
  </LegalPage>;
}
