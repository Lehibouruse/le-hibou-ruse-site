import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Mentions légales" };

export default function Page() {
  return <LegalPage title="Mentions légales">
    <p><strong>Version de pré-lancement.</strong> Cette page est structurée pour la mise en ligne définitive mais les champs entre crochets doivent être remplacés par les informations exactes de l’entité qui exploite réellement Le Hibou Rusé avant toute ouverture commerciale.</p>

    <h2>1. Éditeur du site</h2>
    <p>Le site <strong>Le Hibou Rusé</strong>, destiné à être accessible principalement à l’adresse <strong>d4d5d6.com</strong>, est édité par :</p>
    <p><strong>[DÉNOMINATION SOCIALE / NOM À CONFIRMER]</strong><br />
      [forme juridique] · [capital social si applicable]<br />
      Siège social / adresse professionnelle : [adresse complète]<br />
      SIREN : [à compléter]<br />
      RCS / RNE : [ville et numéro à compléter si applicable]<br />
      TVA intracommunautaire : [numéro ou mention « non applicable » à confirmer]<br />
      E-mail : [adresse professionnelle à confirmer]<br />
      Téléphone : [numéro professionnel à confirmer]
    </p>

    <h2>2. Direction de la publication</h2>
    <p>Directeur de la publication : <strong>[nom à confirmer]</strong>.</p>

    <h2>3. Hébergement</h2>
    <p>Le site est hébergé par <strong>Vercel Inc.</strong>, 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis. <strong>[Coordonnée téléphonique officielle de l’hébergeur à compléter avant publication définitive.]</strong></p>

    <h2>4. Domaine</h2>
    <p>Le domaine public prévu pour le service est <strong>d4d5d6.com</strong>. Tant que sa configuration DNS et son rattachement au projet de production ne sont pas entièrement validés, l’adresse technique Vercel peut rester utilisée à titre de prévisualisation ou de secours.</p>

    <h2>5. Paiement</h2>
    <p>Lorsque les ventes seront ouvertes, les transactions seront destinées à être traitées par <strong>Lemon Squeezy</strong>, qui agit comme <em>Merchant of Record</em> et revendeur autorisé pour le produit numérique. Le prix total, les taxes applicables, les moyens de paiement et les conditions de transaction sont présentés dans son checkout avant validation.</p>

    <h2>6. Fourniture du guide numérique</h2>
    <p>Le guide Le Hibou Rusé est destiné à être fourni sous forme numérique au moyen d’un accès nominatif et sécurisé, notamment via Digify. Les conditions exactes d’accès, de compatibilité, de rétractation et de licence sont précisées dans les Conditions générales de vente applicables au moment de la commande.</p>

    <h2>7. Propriété intellectuelle</h2>
    <p>Sauf indication contraire, les textes, analyses, illustrations, éléments graphiques, logos, vidéos, fichiers, bases éditoriales et autres contenus publiés sous la marque Le Hibou Rusé sont protégés par les droits de propriété intellectuelle applicables. Toute reproduction, adaptation, extraction substantielle, revente, diffusion ou mise à disposition non autorisée est interdite, sous réserve des exceptions prévues par la loi.</p>

    <h2>8. Responsabilité éditoriale</h2>
    <p>Les contenus du Hibou Rusé ont une vocation d’information, de vulgarisation et de pédagogie. Ils ne constituent pas un conseil juridique, fiscal, comptable, financier ou patrimonial individualisé. Les textes peuvent évoluer et une situation réelle doit être appréciée au regard de ses faits propres et des règles en vigueur au moment où elle est mise en œuvre.</p>

    <h2>9. Données personnelles</h2>
    <p>Les modalités de traitement des données personnelles, les prestataires utilisés, les durées de conservation et les droits des personnes sont décrits dans la politique de confidentialité accessible depuis le site.</p>

    <h2>10. Réclamations et médiation</h2>
    <p>Les réclamations pourront être adressées à <strong>[adresse de réclamation à confirmer]</strong>. Pour les litiges relevant de la consommation, les coordonnées du médiateur de la consommation auquel l’éditeur aura effectivement adhéré seront publiées ici et dans les CGV avant toute vente : <strong>[médiateur à désigner et adhésion à finaliser]</strong>.</p>
  </LegalPage>;
}
