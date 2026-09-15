import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Mentions légales" };

export default function Page() {
  return <LegalPage title="Mentions légales">
    <p><strong>Version de pré-lancement.</strong> Les champs entre crochets doivent être complétés avec l’identité juridique réelle de l’éditeur avant toute ouverture commerciale.</p>

    <h2>Éditeur du site</h2>
    <p>Le site <strong>Le Hibou Rusé</strong>, accessible à l’adresse <strong>d4d5d6.com</strong>, est édité par :</p>
    <p><strong>[DÉNOMINATION / NOM À COMPLÉTER]</strong><br />
      [forme juridique à compléter] · [capital social le cas échéant]<br />
      Siège / adresse professionnelle : [à compléter]<br />
      SIREN / RNE : [à compléter]<br />
      TVA intracommunautaire : [à compléter si applicable]<br />
      Contact : [adresse e-mail professionnelle à compléter]
    </p>

    <h2>Direction de la publication</h2>
    <p>Directeur ou responsable de la publication : <strong>[à compléter avant lancement]</strong>.</p>

    <h2>Hébergement</h2>
    <p>Le site est hébergé par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis. Le domaine public utilisé par Le Hibou Rusé est d4d5d6.com.</p>

    <h2>Paiement et fourniture du produit numérique</h2>
    <p>Lorsque les ventes seront ouvertes, les paiements seront traités par Lemon Squeezy, Merchant of Record pour la transaction. L’accès au guide numérique sera fourni séparément au moyen d’un espace de lecture sécurisé et nominatif. Les informations définitives sur le vendeur, le prix, le contenu fourni et les conditions applicables seront présentées avant la commande.</p>

    <h2>Propriété intellectuelle</h2>
    <p>Sauf indication contraire, les textes, analyses, illustrations, marques, éléments graphiques, vidéos et autres contenus publiés sous la marque Le Hibou Rusé sont protégés. Toute reproduction, diffusion, extraction substantielle, commercialisation ou mise à disposition non autorisée est interdite, sous réserve des exceptions prévues par la loi.</p>

    <h2>Responsabilité éditoriale</h2>
    <p>Les contenus du Hibou Rusé sont proposés à des fins d’information et de pédagogie. Ils ne constituent pas un conseil juridique, fiscal, comptable, financier ou patrimonial individualisé. Une situation réelle doit être vérifiée au regard des textes, de la doctrine, de la jurisprudence et de ses faits propres.</p>
  </LegalPage>;
}
