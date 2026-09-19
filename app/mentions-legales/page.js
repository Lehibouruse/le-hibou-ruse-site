import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Mentions légales" };

export default function Page() {
  return <LegalPage title="Mentions légales">
    <p><strong>Version en vigueur : 19 septembre 2026.</strong></p>

    <h2>Éditeur du site</h2>
    <p><strong>Le Hibou Rusé</strong> est un projet éditorial actuellement exploité avant immatriculation de la structure dédiée.</p>
    <p>Structure envisagée : <strong>Limited Liability Company (LLC) de droit du Nouveau-Mexique, États-Unis, en cours de formation et non encore immatriculée</strong>. Cette mention ne signifie pas qu’une personne morale existe déjà.</p>
    <p>Contact : <strong>contact@d4d5d6.fr</strong>.</p>

    <h2>Vente et paiement</h2>
    <p>Les achats du guide numérique sont traités par <strong>Lemon Squeezy</strong>, qui agit comme <em>Merchant of Record</em> pour la transaction. Le prix total et les conditions de paiement applicables sont affichés dans le checkout avant validation.</p>

    <h2>Hébergement</h2>
    <p>Le site est hébergé par <strong>Vercel Inc.</strong>, 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis.</p>

    <h2>Responsabilité éditoriale</h2>
    <p>Les contenus ont une vocation d’information et de pédagogie. Ils ne constituent pas un conseil juridique, fiscal, comptable, financier ou patrimonial individualisé.</p>

    <h2>Propriété intellectuelle</h2>
    <p>Les textes, analyses, illustrations, logos et fichiers publiés sous la marque Le Hibou Rusé sont protégés par les droits de propriété intellectuelle applicables. Toute reproduction ou diffusion substantielle non autorisée est interdite, sous réserve des exceptions légales.</p>

    <h2>Données personnelles</h2>
    <p>Les traitements de données sont décrits dans la politique de confidentialité du site.</p>
  </LegalPage>;
}
