export const revalidate = 60;

const BASE_ID = "appWyUX7TYPNrDbyP";
const CMS_TABLE = "tblkve6jfAgxfhCqB";
const ARTICLES_TABLE = "tblSi46CBgAUHp3LL";
const PRODUCTS_TABLE = "tblVaks8DSkziKEqB";

async function getRecords(tableId) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    console.error("AIRTABLE_TOKEN manquant");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      console.error("Erreur Airtable :", response.status);
      return [];
    }

    const data = await response.json();
    return data.records || [];
  } catch (error) {
    console.error("Erreur connexion Airtable :", error);
    return [];
  }
}

function getBlock(records, key) {
  return records.find((record) => record.fields["Clé"] === key)?.fields;
}

export default async function Home() {
  const [cmsRecords, articleRecords, productRecords] = await Promise.all([
    getRecords(CMS_TABLE),
    getRecords(ARTICLES_TABLE),
    getRecords(PRODUCTS_TABLE),
  ]);

  const hero = getBlock(cmsRecords, "hero") || {};
  const method = getBlock(cmsRecords, "methode") || {};
  const ebook = getBlock(cmsRecords, "ebook") || {};

  const categories = [
    "argent",
    "fiscalite",
    "patrimoine",
    "strategie",
  ]
    .map((key) => getBlock(cmsRecords, key))
    .filter(Boolean);

  const articles = articleRecords
    .filter((record) => record.fields["Publié"])
    .slice(0, 6);

  const product = productRecords.find(
    (record) =>
      record.fields["Actif"] || record.fields["Mis en avant"]
  )?.fields;

  return (
    <>
      <header className="header">
        <nav className="nav">
          <a className="brand" href="#">
            <span className="owl">🦉</span>
            Le Hibou Rusé
          </a>

          <div className="navlinks">
            <a href="#decryptages">Décryptages</a>
            <a href="#methode">La méthode</a>
            <a href="#articles">Articles</a>
            <a href="#ebook">L'ebook</a>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="eyebrow">
              Fiscalité · Argent · Patrimoine
            </div>

            <h1>
              {hero["Titre"] ||
                "Comprendre l’argent. Déjouer les pièges. Décider plus intelligemment."}
            </h1>

            <p>
              {hero["Sous-titre"] ||
                "Le Hibou Rusé décrypte les règles qui façonnent votre argent et vos décisions."}
            </p>

            <a className="button" href="#decryptages">
              {hero["CTA texte"] || "Découvrir les décryptages"}
            </a>
          </div>
        </section>

        <section className="section" id="decryptages">
          <div className="eyebrow">Nos terrains de jeu</div>

          <h2 className="section-title">
            Regarder derrière les règles, les chiffres et les idées reçues.
          </h2>

          <div className="grid">
            {categories.map((category, index) => (
              <article
                className="card"
                key={category["Titre"] || index}
              >
                <div className="card-number">
                  0{index + 1}
                </div>

                <h2>{category["Titre"]}</h2>

                <p>
                  {category["Contenu"] ||
                    category["Sous-titre"]}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="method" id="methode">
          <div className="method-inner">
            <div>
              <div className="eyebrow">La méthode</div>

              <h2>
                {method["Titre"] ||
                  "Voir ce que les autres ne regardent pas."}
              </h2>
            </div>

            <p>
              {method["Contenu"] ||
                "Partir des textes et des chiffres, comparer les scénarios, regarder les effets de seuil et les coûts cachés, puis ramener le tout à une décision simple et compréhensible."}
            </p>
          </div>
        </section>

        <section className="section" id="articles">
          <div className="eyebrow">
            Décryptages récents
          </div>

          <h2 className="section-title">
            Comprendre aujourd'hui pour mieux décider demain.
          </h2>

          <div className="articles">
            {articles.length > 0 ? (
              articles.map((article) => (
                <article
                  className="article"
                  key={article.id}
                >
                  <div className="tag">
                    {article.fields["Catégorie"] ||
                      "Décryptage"}
                  </div>

                  <h3>{article.fields["Titre"]}</h3>

                  <p>{article.fields["Résumé"]}</p>
                </article>
              ))
            ) : (
              <article className="article">
                <div className="tag">Bientôt</div>
                <h3>
                  Les premiers décryptages arrivent.
                </h3>
                <p>
                  Les articles publiés dans Airtable
                  apparaîtront automatiquement ici.
                </p>
              </article>
            )}
          </div>
        </section>

        <section className="ebook" id="ebook">
          <div className="eyebrow">Le guide</div>

          <h2>
            {product?.["Produit"] ||
              ebook["Titre"] ||
              "Le guide du Hibou Rusé"}
          </h2>

          <p>
            {product?.["Description"] ||
              ebook["Contenu"] ||
              "Décryptages, exemples chiffrés et stratégies réunis dans un guide pratique."}
          </p>

          {product?.["Actif"] &&
            product?.["Stripe URL"] && (
              <a
                className="button"
                href={product["Stripe URL"]}
                target="_blank"
                rel="noopener noreferrer"
              >
                {product["CTA texte"] ||
                  "Acheter l'ebook"}
                {product["Prix €"]
                  ? ` — ${product["Prix €"]} €`
                  : ""}
              </a>
            )}
        </section>
      </main>

      <footer className="footer">
        © {new Date().getFullYear()} Le Hibou Rusé ·
        Contenus pédagogiques et informatifs — ils ne
        constituent pas un conseil juridique, fiscal ou
        financier individualisé.
      </footer>
    </>
  );
}
