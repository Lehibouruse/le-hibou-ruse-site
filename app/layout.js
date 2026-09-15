import "./globals.css";
import "./revamp.css";
import "./polish.css";
import "./micro-polish.css";
import { Analytics } from "@vercel/analytics/next";
import AttributionCapture from "../components/AttributionCapture";

export const metadata = {
  metadataBase: new URL("https://d4d5d6.com"),
  alternates: { canonical: "/" },
  title: { default: "Le Hibou Rusé", template: "%s — Le Hibou Rusé" },
  description: "Comprendre les règles. Exploiter les failles. Fiscalité, argent, patrimoine et montages D4 à D6 avec cas concrets, chiffres et risques explicités.",
  openGraph: {
    title: "Le Hibou Rusé — Comprendre les règles. Exploiter les failles.",
    description: "Des stratégies optimisées, ingénieuses, parfois agressives. Cas concrets, chiffres, arbitrages et risques explicités.",
    url: "/",
    siteName: "Le Hibou Rusé",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Le Hibou Rusé — Comprendre les règles. Exploiter les failles.",
    description: "Fiscalité · Argent · Patrimoine · Montages D4 → D6. Voir ce que les autres ne regardent pas.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}<AttributionCapture /><Analytics /></body>
    </html>
  );
}
