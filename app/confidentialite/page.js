import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Confidentialité" };

export default function Page() {
  return <LegalPage title="Confidentialité">
    <p><strong>Version de pré-lancement.</strong> Cette politique est préparée pour le fonctionnement prévu du site et du tunnel de vente. L’identité et les coordonnées définitives du responsable de traitement doivent être complétées, et les durées annoncées doivent être alignées avec les purges techniques avant l’ouverture commerciale.</p>

    <h2>1. Responsable du traitement</h2>
    <p><strong>[DÉNOMINATION SOCIALE / NOM À CONFIRMER]</strong>, [adresse professionnelle], joignable à <strong>[e-mail vie privée à confirmer]</strong>, est responsable des traitements réalisés pour l’exploitation du site, le support, la gestion opérationnelle de l’accès au guide et la mesure first-party décrite ci-dessous.</p>
    <p>Lemon Squeezy traite certaines données en qualité de Merchant of Record pour la transaction, selon ses propres obligations et conditions. D’autres prestataires peuvent agir comme sous-traitants ou responsables distincts selon le traitement concerné.</p>

    <h2>2. Données susceptibles d’être traitées</h2>
    <p>Selon votre utilisation du service, les catégories suivantes peuvent être traitées :</p>
    <ul>
      <li>données de contact et de demande : adresse e-mail, nom ou prénom lorsqu’ils sont fournis, contenu d’un message, contexte, besoin ou objectif communiqué ;</li>
      <li>données de commande : adresse e-mail d’achat, référence de commande, produit, montant, devise, statut de transaction ou de remboursement, édition du guide fournie ;</li>
      <li>données d’accès sécurisé : adresse e-mail destinataire, identifiant du fichier/édition, état de livraison, date de première consultation, événements de lecture autorisés et éventuelles alertes de politique remontées par le lecteur sécurisé ;</li>
      <li>données d’attribution : source, support, campagne, identifiant de contenu, page d’entrée, référent et identifiant de session aléatoire first-party ;</li>
      <li>données techniques et de sécurité strictement nécessaires au fonctionnement, à la prévention des doubles traitements, au diagnostic et à la journalisation des incidents.</li>
    </ul>
    <p>Le site du Hibou Rusé n’a pas vocation à stocker les numéros complets de cartes bancaires ni les cryptogrammes de paiement.</p>

    <h2>3. Finalités et bases juridiques</h2>
    <p>Les traitements sont réalisés pour les finalités suivantes :</p>
    <ul>
      <li><strong>répondre aux demandes et préparer une relation commerciale</strong> : mesures précontractuelles prises à votre demande et, selon le contexte, intérêt légitime à répondre et assurer le suivi ;</li>
      <li><strong>gérer la fourniture du guide et le support après achat</strong> : exécution du contrat et mesures nécessaires à la fourniture du contenu ;</li>
      <li><strong>conserver les preuves de commande, de remboursement et les éléments comptables ou fiscaux requis</strong> : respect d’obligations légales et défense de droits en cas de litige ;</li>
      <li><strong>sécuriser l’accès nominatif au guide et prévenir les traitements en double, fraudes ou usages manifestement contraires aux conditions</strong> : exécution contractuelle et intérêt légitime à sécuriser le service et les contenus ;</li>
      <li><strong>mesurer de façon limitée l’audience et l’efficacité des contenus</strong> : intérêt légitime lorsque la mesure est strictement exemptée de consentement dans les conditions applicables, ou consentement lorsqu’un traceur non nécessaire l’exige ;</li>
      <li><strong>assurer la sécurité, la disponibilité et le diagnostic technique</strong> : intérêt légitime à exploiter un service fiable et sécurisé.</li>
    </ul>

    <h2>4. Paiement avec Lemon Squeezy</h2>
    <p>Le checkout de paiement est destiné à être opéré par Lemon Squeezy en qualité de Merchant of Record. Lemon Squeezy traite les données nécessaires à la transaction, à la facturation, aux taxes, à la lutte contre la fraude, aux remboursements et aux chargebacks selon ses propres conditions et sa politique de confidentialité. Le Hibou Rusé reçoit uniquement les informations nécessaires pour reconnaître la commande, fournir le produit, gérer l’accès et traiter le support.</p>

    <h2>5. Accès sécurisé au guide avec Digify</h2>
    <p>L’adresse e-mail associée à une commande peut être transmise à Digify afin de créer un accès nominatif au guide. L’architecture prévue privilégie un lien individuel et révocable, sans lien générique partagé. Selon la configuration activée, le lecteur peut remonter des événements de consultation tels que la première ouverture ou le nombre de vues. L’impression et le téléchargement sont destinés à être désactivés ; un événement de ce type serait traité comme une anomalie de politique à examiner, et non comme une autorisation implicite.</p>

    <h2>6. Hébergement, base opérationnelle et prestataires</h2>
    <p>Les données strictement nécessaires peuvent être traitées par les prestataires utilisés pour exploiter le service, notamment :</p>
    <ul>
      <li><strong>Vercel</strong> pour l’hébergement et, si activé, la mesure d’audience Web Analytics ;</li>
      <li><strong>Airtable</strong> pour certaines données opérationnelles du site, des demandes, des commandes et des automatisations ;</li>
      <li><strong>Lemon Squeezy</strong> pour la transaction en tant que Merchant of Record ;</li>
      <li><strong>Digify</strong> pour la fourniture d’un accès sécurisé et nominatif au guide.</li>
    </ul>
    <p>Ces prestataires n’accèdent aux données que dans la mesure nécessaire à leurs missions, sous réserve de leurs propres obligations contractuelles et légales.</p>

    <h2>7. Mesure d’audience et attribution first-party</h2>
    <p>Vercel Web Analytics est conçu pour produire des statistiques agrégées sans cookie publicitaire tiers et, dans sa configuration standard, sans identifiant personnel persistant permettant de suivre un visiteur entre plusieurs sites.</p>
    <p>Dans la version actuelle du site, l’attribution first-party du Hibou Rusé ne dépose <strong>aucun cookie, localStorage ou sessionStorage</strong>. Les paramètres de campagne présents dans l’URL, la page d’entrée et le référent sont lus pendant la visite courante. L’identifiant technique utilisé pour rapprocher les événements « arrivée → clic checkout » est aléatoire et conservé <strong>uniquement en mémoire de la page</strong> : il disparaît lors d’un rechargement ou d’une nouvelle navigation complète.</p>
    <p>Les informations ainsi envoyées côté serveur peuvent inclure la source, la campagne, l’identifiant du contenu, la page d’entrée et le référent. Elles n’ont pas pour objet de constituer un profil publicitaire inter-sites, n’utilisent pas de fingerprinting et ne doivent pas contenir de donnée bancaire sensible.</p>
    <p><strong>Si un stockage persistant, un traceur optionnel ou un accès non strictement nécessaire au terminal était ajouté ultérieurement, il devra être audité avant activation et, lorsque la réglementation l’exige, conditionné à un consentement préalable conforme.</strong></p>

    <h2>8. Durées de conservation prévues</h2>
    <p>La politique cible de conservation est la suivante, sous réserve des obligations légales plus longues ou d’un contentieux nécessitant un archivage limité :</p>
    <ul>
      <li>demandes de prospects ou contacts sans commande : jusqu’à <strong>3 ans à compter du dernier contact émanant de la personne</strong> ;</li>
      <li>données opérationnelles de commande et de fourniture : pendant la relation nécessaire à l’exécution, puis archivage des seules données nécessaires à la preuve et aux obligations légales ;</li>
      <li>pièces comptables et justificatifs concernés : jusqu’à <strong>10 ans à compter de la clôture de l’exercice</strong> lorsque cette durée légale est applicable ;</li>
      <li>données d’attribution et événements de conversion first-party : cible maximale de <strong>13 mois</strong>, avec purge ou anonymisation au-delà ;</li>
      <li>journaux techniques et de sécurité : cible de <strong>12 mois</strong>, sauf nécessité de conservation plus longue liée à un incident ou à une obligation légale ;</li>
      <li>données d’accès Digify : pendant la durée utile de l’accès, puis conservation limitée des éléments nécessaires au support, à la preuve de fourniture ou à la gestion d’un litige.</li>
    </ul>
    <p>Avant ouverture commerciale, les mécanismes de purge et d’archivage devront être alignés avec ces durées afin d’éviter toute conservation indéfinie.</p>

    <h2>9. Transferts hors Espace économique européen</h2>
    <p>Certains prestataires peuvent traiter des données depuis des pays situés hors de l’Espace économique européen. Lorsque le RGPD l’exige, ces transferts doivent reposer sur un mécanisme juridique approprié et sur les garanties mises en place par le prestataire concerné. Les informations contractuelles et de confidentialité de chaque prestataire peuvent être consultées auprès de celui-ci.</p>

    <h2>10. Sécurité</h2>
    <p>Le service applique un principe de minimisation et de moindre privilège : les secrets d’API ne sont pas stockés dans les tables publiques ou exposés au navigateur ; les liens de lecture sont individuels ; les opérations sensibles sont séparées et journalisées ; les accès peuvent être révoqués lorsqu’un remboursement ou un incident le justifie dans les limites légales et contractuelles.</p>

    <h2>11. Vos droits</h2>
    <p>Dans les conditions prévues par la réglementation, vous pouvez demander l’accès à vos données, leur rectification, leur effacement, leur limitation, leur portabilité, ou vous opposer à certains traitements. Vous pouvez retirer votre consentement à tout moment lorsqu’un traitement repose sur celui-ci, sans remettre en cause la licéité des traitements antérieurs au retrait.</p>
    <p>Les demandes pourront être adressées à <strong>[e-mail vie privée à confirmer]</strong>. Une vérification raisonnable de l’identité peut être demandée en cas de doute sur l’auteur de la demande. Vous disposez également du droit d’introduire une réclamation auprès de la CNIL.</p>

    <h2>12. Mise à jour de la politique</h2>
    <p>Cette politique pourra être mise à jour pour refléter l’évolution du service, des prestataires ou de la réglementation. La version applicable sera datée et publiée sur cette page. Une modification substantielle concernant un traitement en cours fera l’objet d’une information appropriée lorsque la réglementation l’exige.</p>
  </LegalPage>;
}
