import { notFound } from "next/navigation";
import { getRecords, TABLES } from "../../../lib/airtable";

export const revalidate = 60;

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const articles = await getRecords(TABLES.articles);
  const article = articles.find((record) => record.fields.Slug === slug && record.fields.Publié)?.fields;
  if (!article) notFound();
  return <main className="legal article-page"><a className="brand" href="/"><img src="/hibou.svg" alt="" />Le Hibou Rusé</a><div className="eyebrow dark"><span /> {article.Catégorie || "Décryptage"}</div><h1>{article.Titre}</h1><p className="article-summary">{article.Résumé}</p><div className="legal-copy article-body">{String(article.Contenu || "").split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><p className="article-disclaimer">Information générale — aucune recommandation personnalisée.</p><a className="text-back" href="/">← Retour à l’accueil</a></main>;
}
