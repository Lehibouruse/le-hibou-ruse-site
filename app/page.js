import Brand from "../components/Brand";
import LeadForm from "../components/LeadForm";
import TrackedLink from "../components/TrackedLink";
import { block, configMap, getAllRecords, getRecords, TABLES } from "../lib/airtable";
import { commercialReadiness } from "../lib/launch-readiness.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const [cms, articleRecords, productRecords, configuration, bookRecords, legalRecords] = await Promise.all([
    getRecords(TABLES.cms),
    getRecords(TABLES.articles),
    getRecords(TABLES.products),
    getAllRecords(TABLES.configuration, { maxRecords: 500 }),
    getRecords(TABLES.book),
    getRecords(TABLES.legal),
  ]);
  const hero = block(cms, "hero");
  const method = block(cms, "methode");
  const ebook = block(cms, "ebook");
  const strategy = block(cms, "strategie");
  const footer = block(cms, "footer");
  const config = configMap(configuration);
  const product = productRecords.find((record) => record.fields.Actif)?.fields || {};
  const logoUrl = "/hibou-monocle.webp";
  const readiness = commercialReadiness({ config, product, chapters: bookRecords, legal: legalRecords });
  const checkoutUrl = readiness.checkoutUrl;
  const ctaText = config.ebook_cta || product["CTA texte"] || "Acheter le guide — 29 €";
  const articles = articleRecords
    .filter((record) => record.fields.Publié && record.fields["À la une"])
    .slice(0, 6);

  return (
    <>
      <header className="header"><nav className="nav" aria-label="Navigation principale">
        <Brand href="#top" logoUrl={logoUrl} />
        <div className="navlinks"><a href="#ebook">Le guide</a><a href="#methode">D4 → D6</a>{articles.length > 0 && <a href="#articles">Décryptages</a>}<a href="#services">Services proposés</a></div>
        <TrackedLink event="header_ebook_click" className="nav-cta" href="#ebook">Découvrir le guide</TrackedLink>
      </nav></header>

      <main id="top">
        <section className="hero"><div className="hero-grid"><div>
          <div className="eyebrow"><span /> Fiscalité · Argent · Patrimoine</div>
          <h1>{hero.Titre || "Comprendre les règles. Exploiter les failles."}</h1>
          <p>{hero["Sous-titre"] || "Des stratégies optimisées, ingénieuses, parfois agressives. Des cas concrets. Des chiffres. Les risques. Pas de morale."}</p>
          <div className="actions"><TrackedLink event="hero_ebook_click" className="button" href="#ebook">{ctaText}</TrackedLink><TrackedLink event="hero_montage_click" className="text-link" href="#services">Étudier un montage <span>↗</span></TrackedLink></div>
          <p className="hero-reassurance">Cas concrets · exemples chiffrés · risques explicités</p>
        </div><aside className="hero-card" aria-label="La méthode du Hibou"><img src={logoUrl} alt="Emblème du Hibou Rusé" /><p className="hero-card-title">Trois niveaux de montage. Jusqu’où peut-on pousser l’optimisation ?</p><div className="level-line"><strong>D4</strong><span>Solide et documenté</span></div><div className="level-line"><strong>D5</strong><span>Agressif mais argumentable</span></div><div className="level-line"><strong>D6</strong><span>Limite (borderline selon interprétation)</span></div></aside></div></section>

        <section className="ebook" id="ebook"><div><div className="eyebrow"><span /> Guide pratique</div><h2>{ebook.Titre || product.Produit || "Le guide du Hibou Rusé"}</h2><p className="ebook-intro">{ebook["Sous-titre"] || ebook.Contenu || product.Description}</p>
          <ul className="ebook-benefits ebook-benefits-main">
            <li><strong>Ramener légalement l’imposition à zéro</strong> dans certaines configurations.</li>
            <li><strong>Bâtir un business rentable autour d’aides et de subventions publiques</strong>, sans confondre financement public et revenu personnel.</li>
            <li><strong>Utiliser intelligemment l’entrepreneuriat social</strong> et les statuts qui changent l’économie d’un projet.</li>
            <li><strong>Faire sortir légalement de la valeur d’une entreprise</strong> avec une imposition nulle ou très faible lorsque la configuration le permet.</li>
            <li><strong>Combiner fiscalité, crédit, structures et patrimoine</strong> plutôt que raisonner dispositif par dispositif.</li>
          </ul>
          <div className="not-basic"><strong>Vous n’apprendrez pas ici les montages que l’on retrouve partout.</strong><span>PEA · assurance-vie · PER · Girardin · 150-0 B ter · LMNP · SCPI…</span></div>
          <p className="ebook-goal"><strong>L’objectif :</strong> des montages plus élaborés, plus originaux et parfois plus gris. Toujours avec leurs conditions, leurs limites et leur niveau de risque D4, D5 ou D6.</p>
          <div className="price"><span className="price-amount">{config.ebook_price || product["Prix €"] || 29}&nbsp;€</span> <small>paiement unique</small></div>{checkoutUrl ? <><TrackedLink event="checkout_opened" className="button" href={checkoutUrl} target="_blank" rel="noopener noreferrer">{ctaText}</TrackedLink><p className="checkout-note">Paiement sécurisé par Lemon Squeezy, Merchant of Record · accès protégé envoyé par e-mail</p></> : <><button className="button disabled" disabled>{ctaText} · bientôt disponible</button><p className="checkout-note">Ouverture commerciale après validation des dépendances techniques.</p></>}
        </div><div className="book-mark" aria-label="Couverture du guide"><img src={logoUrl} alt="" /><span>LE GUIDE DU</span><strong>HIBOU<br />RUSÉ</strong><small>COMPRENDRE · EXPLOITER · ARBITRER</small></div></section>

        <section className="method" id="methode"><div className="method-inner"><div><div className="eyebrow"><span /> D4 → D6</div><h2>{method.Titre || "Jusqu’où peut-on optimiser ?"}</h2><p className="method-intro">{method["Sous-titre"] || "Trois niveaux de montage. Trois niveaux d’audace."}</p></div><div className="levels"><article><b>D4</b><div><h3>Solide et documenté</h3><p>Montage légal, propre et difficile à contester lorsque les conditions sont réellement remplies.</p></div></article><article><b>D5</b><div><h3>Agressif mais argumentable</h3><p>On pousse les textes, exceptions et interactions plus loin. Le montage reste défendable, mais exige une documentation sérieuse.</p></div></article><article><b>D6</b><div><h3>Limite (borderline selon interprétation)</h3><p>Optimisation très agressive : le montage peut tenir ou tomber selon les faits, la rédaction et l’interprétation retenue.</p></div></article></div></div></section>

        {articles.length > 0 && <section className="section" id="articles"><div className="section-head"><div><div className="eyebrow dark"><span /> Décryptages récents</div><h2>Voir ce que les autres<br />ne regardent pas.</h2></div></div><div className="articles">{articles.map((article) => <article className="article" key={article.id}><div className="tag">{article.fields.Catégorie || "Décryptage"}</div><h3>{article.fields.Titre}</h3><p>{article.fields.Résumé}</p><a href={`/articles/${article.fields.Slug}`}>Lire le décryptage <span>↗</span></a></article>)}</div></section>}

        <section className="services" id="services"><div className="services-inner"><div className="services-copy"><div className="eyebrow dark"><span /> Services proposés</div><h2>{strategy.Titre || "Quels montages du Hibou pourraient vous intéresser ?"}</h2><p>Vous passez peut-être à côté de mécanismes, seuils ou combinaisons de règles que vous n’avez jamais regardés. Le Hibou vous aide à explorer sa bibliothèque de montages et à comprendre ceux qui correspondent aux thèmes que vous souhaitez approfondir.</p><div className="service-cards"><article><span>01</span><h3>Montages à explorer</h3><strong>500 €</strong><p>Vous indiquez les thèmes et contraintes qui vous intéressent. Le Hibou sélectionne des montages et scénarios pédagogiques de sa bibliothèque à explorer, puis en présente le mécanisme, les conditions générales, les limites et les risques.</p></article><article><span>02</span><h3>Montage atypique spécifique</h3><strong>Sur devis</strong><p>Vous avez un mécanisme précis en tête ? Le Hibou peut en proposer un décryptage pédagogique : fonctionnement, hypothèses, points de vigilance, limites et questions à faire vérifier avant toute mise en œuvre.</p></article></div><div className="notice"><strong>Le cadre est clair.</strong> Le Hibou Rusé propose de l’information, du décryptage et des scénarios pédagogiques. Il ne fournit pas de recommandation juridique, fiscale ou financière individualisée et n’indique pas quel investissement ou montage vous devez réaliser. Une validation par le professionnel compétent reste nécessaire lorsqu’elle est requise.</div></div><div><div className="form-heading"><span>Écrire au Hibou</span><h3>Quels sujets voulez-vous explorer ?</h3><p>Indiquez les thèmes, contraintes et questions qui vous intéressent : le Hibou pourra vous orienter vers les contenus et scénarios de sa bibliothèque à approfondir.</p></div><LeadForm /></div></div></section>
      </main>

      <footer className="footer"><div className="footer-inner"><Brand className="footer-brand" logoUrl={logoUrl} /><p>{footer.Contenu || "Contenus pédagogiques et informatifs. Le Hibou Rusé n’est pas un CGP et ne fournit pas de conseil juridique, fiscal ou financier individualisé réglementé."}</p><div><a href="/mentions-legales">Mentions légales</a><a href="/cgv">CGV</a><a href="/confidentialite">Confidentialité</a><a href="/conditions-utilisation">Conditions d’utilisation</a><a href="/retractation">Rétractation — informations légales</a></div></div></footer>
      <TrackedLink event="mobile_ebook_click" className="mobile-cta" href="#ebook">Découvrir le guide · {config.ebook_price || product["Prix €"] || 29} €</TrackedLink>
    </>
  );
}
