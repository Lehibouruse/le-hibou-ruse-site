import Brand from "../components/Brand";
import LeadForm from "../components/LeadForm";
import TrackedLink from "../components/TrackedLink";
import { block, configMap, getRecords, TABLES } from "../lib/airtable";

export const revalidate = 60;

export default async function Home() {
  const [cms, articleRecords, productRecords, configuration] = await Promise.all([
    getRecords(TABLES.cms), getRecords(TABLES.articles), getRecords(TABLES.products), getRecords(TABLES.configuration),
  ]);
  const hero = block(cms, "hero");
  const method = block(cms, "methode");
  const ebook = block(cms, "ebook");
  const strategy = block(cms, "strategie");
  const footer = block(cms, "footer");
  const config = configMap(configuration);
  const product = productRecords.find((record) => record.fields.Actif)?.fields || {};
  const checkoutUrl = config.checkout_url || "";
  const ctaText = config.ebook_cta || product["CTA texte"] || "Acheter l’e-book — 29 €";
  const articles = articleRecords.filter((record) => record.fields.Publié).sort((a, b) => Number(Boolean(b.fields["À la une"])) - Number(Boolean(a.fields["À la une"]))).slice(0, 6);
  const categories = ["argent", "fiscalite", "patrimoine"].map((key) => block(cms, key));
  return (
    <>
      <header className="header"><nav className="nav" aria-label="Navigation principale">
        <Brand href="#top" />
        <div className="navlinks"><a href="#decrypter">Décryptages</a><a href="#methode">D4 → D6</a>{articles.length > 0 && <a href="#articles">Articles</a>}<a href="#montage">Sur mesure</a></div>
        <TrackedLink event="header_ebook_click" className="nav-cta" href="#ebook">Découvrir le guide</TrackedLink>
      </nav></header>
      <main id="top">
        <section className="hero"><div className="hero-grid"><div>
          <div className="eyebrow"><span /> Fiscalité · Argent · Patrimoine</div>
          <h1>{hero.Titre || "Comprendre les règles. Exploiter les arbitrages. Garder une longueur d’avance."}</h1>
          <p>{hero["Sous-titre"] || "Fiscalité, argent, patrimoine : des stratégies du D4 au D6, expliquées avec des chiffres et sans jargon."}</p>
          <div className="actions"><TrackedLink event="hero_ebook_click" className="button" href="#ebook">{ctaText}</TrackedLink><TrackedLink event="hero_montage_click" className="text-link" href="#montage">Étudier un montage <span>↗</span></TrackedLink></div>
          <p className="hero-reassurance">Cas concrets · exemples chiffrés · risques explicités</p>
        </div><aside className="hero-card" aria-label="La méthode du Hibou"><img src="/hibou.svg" alt="Emblème du Hibou Rusé" /><p className="hero-card-title">Trois niveaux. Un même réflexe&nbsp;: documenter.</p><div className="level-line"><strong>D4</strong><span>Optimisation documentée</span></div><div className="level-line"><strong>D5</strong><span>Structuration approfondie</span></div><div className="level-line"><strong>D6</strong><span>Frontière à faire valider</span></div></aside></div></section>
        <section className="trust-strip" aria-label="Les engagements éditoriaux"><div><strong>Des mécanismes, pas des miracles.</strong><span>Textes, chiffres et hypothèses clairement distingués.</span></div><div><strong>Le risque fait partie de l’analyse.</strong><span>Limites, incertitudes et validations sont explicitées.</span></div><div><strong>Comprendre avant d’agir.</strong><span>Une méthode conçue pour éclairer la décision.</span></div></section>
        <section className="section" id="decrypter"><div className="section-head"><div><div className="eyebrow dark"><span /> Nos terrains de jeu</div><h2>Voir ce que les autres<br />ne regardent pas.</h2></div><p>Nous partons des textes et des chiffres pour repérer les seuils, les coûts cachés et les interactions qui changent réellement une décision.</p></div><div className="grid">{categories.map((category, index) => <article className="topic-card" key={category.Titre || index}><span>0{index + 1}</span><h3>{category.Titre}</h3><p>{category.Contenu || category["Sous-titre"]}</p></article>)}</div></section>
        <section className="method" id="methode"><div className="method-inner"><div><div className="eyebrow"><span /> La méthode</div><h2>{method.Titre || "Du D4 au D6"}</h2><p className="method-intro">{method["Sous-titre"]}</p></div><div className="levels"><article><b>D4</b><div><h3>Solide et reproductible</h3><p>Arbitrages légaux, choix de régime, seuils et dispositifs documentés.</p></div></article><article><b>D5</b><div><h3>Agressif et argumenté</h3><p>Zones d’interprétation et articulations de régimes avec analyse renforcée.</p></div></article><article><b>D6</b><div><h3>À la frontière</h3><p>Défendabilité très dépendante des faits : validation professionnelle impérative.</p></div></article></div></div></section>
        {articles.length > 0 && <section className="section" id="articles"><div className="section-head"><div><div className="eyebrow dark"><span /> Décryptages récents</div><h2>Comprendre avant<br />de décider.</h2></div></div><div className="articles">{articles.map((article) => <article className="article" key={article.id}><div className="tag">{article.fields.Catégorie || "Décryptage"}</div><h3>{article.fields.Titre}</h3><p>{article.fields.Résumé}</p><a href={`/articles/${article.fields.Slug}`}>Lire le décryptage <span>↗</span></a></article>)}</div></section>}
        <section className="ebook" id="ebook"><div><div className="eyebrow"><span /> Le guide pratique</div><h2>{product.Produit || ebook.Titre || "L’e-book du Hibou Rusé"}</h2><p>{product.Description || ebook.Contenu}</p><ul className="ebook-benefits"><li>Cas concrets et exemples chiffrés</li><li>Grille de lecture du D4 au D6</li><li>Seuils, exceptions et interactions à repérer</li></ul><div className="price">{config.ebook_price || product["Prix €"] || 29} € <small>paiement unique</small></div>{checkoutUrl ? <><TrackedLink event="checkout_opened" className="button" href={checkoutUrl} target="_blank" rel="noopener noreferrer">{ctaText}</TrackedLink><p className="checkout-note">Paiement sécurisé chez notre prestataire · accès envoyé par e-mail</p></> : <button className="button disabled" disabled>{ctaText} · bientôt disponible</button>}</div><div className="book-mark" aria-label="Couverture du guide"><img src="/hibou.svg" alt="" /><span>LE GUIDE DU</span><strong>HIBOU<br />RUSÉ</strong><small>COMPRENDRE · ARBITRER · DÉCIDER</small></div></section>
        <section className="montage" id="montage"><div className="montage-inner"><div><div className="eyebrow dark"><span /> Sur mesure</div><h2>{strategy.Titre || "Montage personnalisé"}</h2><p>{strategy.Contenu || strategy["Sous-titre"]}</p><div className="notice"><strong>Le cadre est clair.</strong> Information et structuration en amont ; validation par un professionnel lorsque le sujet l’exige.</div></div><LeadForm /></div></section>
      </main>
      <footer className="footer"><div className="footer-inner"><Brand className="footer-brand" /><p>{footer.Contenu || "Contenus pédagogiques et informatifs. Ils ne constituent pas un conseil individualisé."}</p><div><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a><a href="/conditions-utilisation">Conditions d’utilisation</a></div></div></footer>
      <TrackedLink event="mobile_ebook_click" className="mobile-cta" href="#ebook">Découvrir le guide · {config.ebook_price || product["Prix €"] || 29} €</TrackedLink>
    </>
  );
}
