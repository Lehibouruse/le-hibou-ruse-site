import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Confidentialité" };

export default function Page() {
  return <LegalPage title="Confidentialité">
    <p><strong>Version de pré-lancement.</strong> L’identité et les coordonnées définitives du responsable de traitement doivent être complétées avant l’ouverture commerciale.</p>

    <h2>Responsable du traitement</h2>
    <p><strong>[DÉNOMINATION / NOM À COMPLÉTER]</strong> · [adresse professionnelle] · [e-mail de contact vie privée].</p>

    <h2>Données utilisées</h2>
    <p>Selon votre utilisation du site, Le Hibou Rusé peut traiter les informations que vous saisissez dans les formulaires, notamment votre nom ou prénom lorsqu’il est fourni, votre adresse e-mail, votre situation, vos objectifs et le contenu de votre demande. Lors d’un achat, les informations utiles à la fourniture et au suivi du produit sont également traitées, notamment l’e-mail d’achat, la référence de commande, l’édition du livre fournie et l’état de la livraison.</p>

    <h2>Finalités et bases du traitement</h2>
    <p>Ces données servent à répondre aux demandes reçues, exploiter le site, préparer ou exécuter la fourniture d’un produit numérique, assurer le suivi d’une commande et de son accès sécurisé, prévenir les doubles traitements techniques et respecter les obligations légales applicables. Avant le lancement, le responsable de traitement devra documenter précisément la base juridique et la durée de conservation applicables à chaque catégorie.</p>

    <h2>Prestataires et destinataires</h2>
    <p>Les données strictement nécessaires peuvent être traitées par les prestataires techniques utilisés pour fournir le service. À la date de préparation de cette politique, l’architecture prévoit notamment Vercel pour l’hébergement, Airtable pour certaines données opérationnelles, Lemon Squeezy pour la transaction en tant que Merchant of Record et Digify pour l’accès nominatif et protégé au livre. Chaque prestataire applique également ses propres engagements et conditions de confidentialité.</p>

    <h2>Paiement</h2>
    <p>Le Hibou Rusé ne stocke pas les numéros complets de cartes bancaires. Les données de paiement sont traitées dans l’environnement du prestataire de paiement. Le site conserve uniquement les informations opérationnelles nécessaires au rapprochement de la commande et à la fourniture de l’accès.</p>

    <h2>Lecture protégée du guide</h2>
    <p>Lorsque le guide sera commercialisé, l’adresse e-mail utilisée pour l’achat pourra être transmise au prestataire de lecture sécurisée afin de créer un accès nominatif. Selon les paramètres retenus, des événements de consultation tels que première ouverture, vues, impression ou téléchargement autorisé pourront être remontés afin d’assurer la fourniture, la sécurité du contenu et le support. Le paramétrage définitif sera indiqué avant lancement.</p>

    <h2>Mesure d’audience et cookies</h2>
    <p>Le site peut utiliser une mesure d’audience sobre pour comprendre la fréquentation et les interactions essentielles. Aucun traceur optionnel nécessitant un consentement ne doit être activé sans mécanisme adapté. Cette section devra être mise à jour si de nouveaux outils publicitaires ou de suivi sont ajoutés.</p>

    <h2>Durées de conservation</h2>
    <p>Les données ne doivent pas être conservées plus longtemps que nécessaire au regard de leur finalité et des obligations légales. <strong>[À COMPLÉTER AVANT LANCEMENT : tableau ou critères de conservation pour demandes, commandes, facturation, accès Digify et journaux techniques.]</strong></p>

    <h2>Vos droits</h2>
    <p>Vous pouvez, lorsque les conditions légales sont réunies, demander l’accès à vos données, leur rectification, leur effacement, leur limitation, leur portabilité ou vous opposer à certains traitements. Vous pouvez également retirer un consentement lorsqu’un traitement repose sur celui-ci. Les demandes pourront être adressées à <strong>[e-mail vie privée à compléter]</strong>. Vous disposez par ailleurs du droit d’introduire une réclamation auprès de la CNIL.</p>

    <h2>Transferts internationaux</h2>
    <p>Certains prestataires techniques peuvent traiter des données hors de l’Espace économique européen. Avant lancement commercial, les transferts effectivement utilisés et les garanties correspondantes devront être documentés dans la présente politique.</p>
  </LegalPage>;
}
