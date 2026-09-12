export default function LegalPage({ title, children }) {
  return <main className="legal"><a className="brand" href="/"><img src="/hibou.svg" alt="" />Le Hibou Rusé</a><div className="eyebrow dark"><span /> Informations</div><h1>{title}</h1><div className="legal-copy">{children}</div><a className="text-back" href="/">← Retour à l’accueil</a></main>;
}
