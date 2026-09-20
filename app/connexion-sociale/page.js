export const metadata = {
  title: "Connexion sociale · Le Hibou Rusé",
  robots: { index: false, follow: false },
};

function label(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (normalized === "meta") return "Facebook";
  if (normalized === "threads") return "Threads";
  if (normalized === "youtube") return "YouTube";
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "tiktok") return "TikTok";
  if (normalized === "pinterest") return "Pinterest";
  if (normalized === "x") return "X";
  return "Réseau social";
}

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const connected = String(params?.connected || "");
  const tested = String(params?.tested || "");
  const synced = String(params?.synced || "");
  const error = String(params?.error || "");
  const success = Boolean(connected) && !error;
  const readOk = tested === "read_ok";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px", background: "#102d25", color: "#f8f0df", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "100%", maxWidth: 680, background: "#15352d", border: "1px solid #34594d", borderRadius: 20, padding: 32 }}>
        <p style={{ marginTop: 0, color: "#d9b875", fontWeight: 700 }}>Le Hibou Rusé</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, marginBottom: 16 }}>
          {success ? "Connexion réussie" : "Connexion non terminée"}
        </h1>
        {success ? (
          <>
            <p><strong>{label(connected)}</strong> est maintenant relié au Hibou.</p>
            <p>{readOk ? "Le test de lecture API a réussi." : "L’autorisation a été enregistrée ; le test de lecture reste à vérifier."}</p>
            <p>{synced === "1" ? "La configuration Airtable et le control plane ont été resynchronisés." : "La resynchronisation sera relancée automatiquement."}</p>
            <p style={{ color: "#b9c9c2" }}>Tu peux fermer cette page et revenir dans ChatGPT. Aucun post n’a été publié.</p>
          </>
        ) : (
          <>
            <p>La connexion OAuth n’a pas pu être finalisée.</p>
            {error ? <p style={{ color: "#eac887" }}>Détail : {error}</p> : null}
            <p style={{ color: "#b9c9c2" }}>Reviens dans ChatGPT : le diagnostic peut être repris sans exposer de secret.</p>
          </>
        )}
      </section>
    </main>
  );
}
