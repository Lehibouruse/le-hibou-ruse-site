import Brand from "./Brand";

export default function LegalPage({ title, children }) {
  return <main className="legal">
    <Brand />
    <div className="eyebrow dark"><span /> Informations</div>
    <h1>{title}</h1>
    <div className="legal-copy">{children}</div>
    <nav className="legal-links" aria-label="Informations juridiques">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/cgv">CGV</a>
      <a href="/confidentialite">Confidentialité</a>
      <a href="/conditions-utilisation">Conditions d’utilisation</a>
      <a href="/retractation">Renoncer au contrat ici</a>
    </nav>
    <a className="text-back" href="/">← Retour à l’accueil</a>
  </main>;
}
