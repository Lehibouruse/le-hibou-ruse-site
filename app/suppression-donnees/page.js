import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Suppression des données", alternates: { canonical: "/suppression-donnees" } };

export default function Page() {
  return <LegalPage title="Suppression des données">
    <p><strong>Le Hibou Rusé</strong> utilise uniquement les données nécessaires au fonctionnement du site, au support, au paiement et aux connexions sociales autorisées.</p>

    <h2>Demander la suppression</h2>
    <p>Pour demander la suppression des données associées à votre compte, votre adresse e-mail ou une autorisation sociale, écrivez à <strong>contact@d4d5d6.fr</strong> avec l’objet <strong>« Suppression de mes données »</strong>.</p>
    <p>Indiquez uniquement les informations nécessaires pour retrouver votre dossier ou la connexion concernée. Ne transmettez jamais de mot de passe, code 2FA, numéro complet de carte bancaire ou secret API.</p>

    <h2>Données concernées</h2>
    <p>Lorsque la demande est applicable, nous supprimons ou anonymisons les données opérationnelles qui ne doivent plus être conservées et révoquons les autorisations OAuth concernées. Certaines données peuvent devoir être conservées plus longtemps lorsqu’une obligation légale, comptable, antifraude ou de défense de droits l’impose.</p>

    <h2>Révoquer Meta directement</h2>
    <p>Vous pouvez également retirer l’accès de l’application depuis les paramètres Facebook/Instagram de votre compte Meta. La révocation côté Meta empêche l’application d’utiliser de nouveaux appels avec l’autorisation retirée.</p>

    <h2>Contact</h2>
    <p><strong>contact@d4d5d6.fr</strong></p>
  </LegalPage>;
}
