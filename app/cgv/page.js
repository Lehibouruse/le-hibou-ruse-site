import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Conditions générales de vente" };

export default function Page() {
  return <LegalPage title="Conditions générales de vente">
    <p><strong>Projet de CGV — non encore applicable.</strong> Ces conditions sont préparées pour le lancement du guide numérique Le Hibou Rusé. Elles devront être complétées avec l’identité du fournisseur, les coordonnées de contact, la politique de réclamation/médiation et le paramétrage définitif du checkout avant toute vente.</p>

    <h2>1. Fournisseur du contenu</h2>
    <p>Le contenu numérique est fourni sous la marque Le Hibou Rusé par <strong>[DÉNOMINATION / NOM, FORME JURIDIQUE, ADRESSE, SIREN ET CONTACT À COMPLÉTER]</strong>, ci-après « le Fournisseur ».</p>

    <h2>2. Produit</h2>
    <p>Le produit principal est un guide numérique consacré à l’analyse pédagogique de mécanismes fiscaux, patrimoniaux, entrepreneuriaux et financiers, avec présentation des conditions, limites et risques. L’achat porte sur un droit personnel d’accès au contenu correspondant à l’édition indiquée lors de la commande. Le contenu ne constitue pas un conseil juridique, fiscal, comptable, financier ou patrimonial individualisé.</p>

    <h2>3. Prix</h2>
    <p>Le prix public prévu pour le guide est de <strong>29 €</strong> en paiement unique, sauf offre ou évolution affichée clairement avant la commande. Le prix, les éventuelles taxes et le montant total à payer sont présentés dans le checkout avant validation.</p>

    <h2>4. Paiement et Merchant of Record</h2>
    <p>La transaction est destinée à être traitée par Lemon Squeezy en qualité de Merchant of Record. Le consommateur conclut la transaction de paiement avec Lemon Squeezy selon les conditions affichées dans son checkout et ses Buyer Terms. Le Hibou Rusé demeure le fournisseur du contenu proposé sous sa marque. Aucune donnée complète de carte bancaire n’est stockée par le site du Hibou Rusé.</p>

    <h2>5. Fourniture et accès</h2>
    <p>Après confirmation d’une commande valide, le système crée un accès personnel au guide pour l’adresse e-mail utilisée lors de l’achat. L’architecture prévue repose sur un lecteur sécurisé Digify. L’accès peut être nominatif et comporter un filigrane dynamique. Le lien d’accès est personnel et ne doit pas être partagé, revendu ou mis à disposition d’un tiers.</p>

    <h2>6. Délai de fourniture</h2>
    <p>L’accès est destiné à être créé automatiquement après confirmation de paiement. En cas d’incident technique, le client peut contacter <strong>[adresse support à compléter]</strong>. La preuve de la commande et l’état de la livraison sont conservés dans les systèmes opérationnels afin de traiter les demandes de support.</p>

    <h2>7. Droit de rétractation et contenu numérique</h2>
    <p>Les règles légales applicables au droit de rétractation pour les contrats à distance et les contenus numériques demeurent pleinement applicables. Lorsque le droit permet une fourniture immédiate entraînant la perte du droit de rétractation, celle-ci ne pourra être invoquée que si le checkout recueille effectivement les consentements et reconnaissances requis. <strong>Le lancement commercial est interdit tant que ce paramétrage n’a pas été vérifié.</strong></p>

    <h2>8. Réclamations, remboursements et chargebacks</h2>
    <p>Les demandes liées à une commande peuvent être adressées à <strong>[adresse support à compléter]</strong>. Les remboursements de transactions sont traités dans l’environnement Lemon Squeezy selon les droits légaux applicables, les conditions du Merchant of Record et la politique commerciale définitive du produit. Lorsqu’une commande est remboursée ou annulée et que la situation le justifie, l’accès sécurisé au guide peut être révoqué.</p>

    <h2>9. Propriété intellectuelle et licence d’usage</h2>
    <p>L’achat n’emporte aucune cession de droits de propriété intellectuelle. Sauf disposition légale contraire, le client reçoit un droit personnel de consultation pour son usage propre. La reproduction substantielle, le partage public, la revente, la mise à disposition collective, l’extraction systématique ou la diffusion du guide sont interdits sans autorisation.</p>

    <h2>10. Mise à jour du contenu</h2>
    <p>Les matières abordées peuvent évoluer. Une analyse datée peut devenir obsolète en raison d’une modification législative, réglementaire, doctrinale, jurisprudentielle ou factuelle. Le Fournisseur ne garantit pas qu’une stratégie décrite reste applicable dans le futur ou à un cas individuel. Les conditions d’accès aux éventuelles versions ultérieures seront indiquées dans l’offre commerciale.</p>

    <h2>11. Responsabilité</h2>
    <p>Le guide a une vocation pédagogique et générale. Le lecteur demeure responsable des décisions prises dans sa situation propre et doit obtenir les validations professionnelles nécessaires. Aucune clause des présentes n’a pour objet d’exclure ou de limiter un droit impératif du consommateur.</p>

    <h2>12. Droit applicable, réclamation et médiation</h2>
    <p><strong>[À COMPLÉTER AVANT VENTE : droit applicable, procédure de réclamation, coordonnées du médiateur de la consommation compétent et informations obligatoires de règlement des litiges.]</strong></p>

    <h2>13. Entrée en vigueur</h2>
    <p>Ces CGV n’entreront en vigueur qu’après publication de leur version finale et ouverture effective des ventes. La version applicable à une commande sera celle présentée au moment de l’achat.</p>
  </LegalPage>;
}
