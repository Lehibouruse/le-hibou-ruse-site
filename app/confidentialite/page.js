import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Confidentialité" };
export default function Page() {
  return <LegalPage title="Confidentialité"><h2>Données collectées</h2><p>Le formulaire de montage collecte les informations que vous saisissez afin de traiter votre demande. Les données sont conservées dans les outils opérationnels du Hibou Rusé et ne sont pas vendues.</p><h2>Mesure d’audience</h2><p>Le site utilise Vercel Web Analytics pour mesurer la fréquentation et les interactions essentielles. Aucune donnée bancaire n’est stockée sur ce site.</p><h2>Vos droits</h2><p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données depuis le canal de contact utilisé lors de votre demande.</p></LegalPage>;
}
