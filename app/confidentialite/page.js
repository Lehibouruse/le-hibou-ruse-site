import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Confidentialité", alternates: { canonical: "/confidentialite" } };

export default function Page() {
  return <LegalPage title="Confidentialité">
    <p><strong>Version en vigueur : 20 septembre 2026.</strong></p>

    <h2>Responsable opérationnel</h2>
    <p>Le Hibou Rusé est un projet éditorial exploité avant immatriculation de sa structure dédiée. La structure envisagée est <strong>Le Hibou Rusé, LLC de droit du Nouveau-Mexique, actuellement en cours de formation et non encore immatriculée</strong>. Cette mention ne signifie pas qu’une personne morale existe déjà. Contact vie privée : <strong>contact@d4d5d6.fr</strong>.</p>

    <h2>Données traitées</h2>
    <p>Le service peut traiter les données nécessaires aux demandes de contact, à la commande, à la livraison du guide, au support, à la sécurité et à une mesure d’audience limitée : notamment e-mail, référence de commande, statut de paiement, état d’accès Digify et informations techniques nécessaires au fonctionnement.</p>

    <h2>Prestataires</h2>
    <p><strong>Lemon Squeezy</strong> traite les données nécessaires à la transaction en qualité de Merchant of Record. <strong>Digify</strong> fournit l’accès sécurisé au guide. <strong>Vercel</strong> héberge le site et <strong>Airtable</strong> est utilisé pour certaines données opérationnelles.</p>

    <h2>Paiement</h2>
    <p>Le site du Hibou Rusé ne stocke pas les numéros complets de carte bancaire ni les cryptogrammes de paiement.</p>

    <h2>Vos droits</h2>
    <p>Dans les conditions prévues par la réglementation applicable, vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données, ou vous opposer à certains traitements, en écrivant à <strong>contact@d4d5d6.fr</strong>. Vous pouvez également saisir la CNIL lorsque le RGPD s’applique.</p>
  </LegalPage>;
}
