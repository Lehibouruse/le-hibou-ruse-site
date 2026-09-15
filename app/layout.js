import "./globals.css";
import "./revamp.css";
import "./polish.css";
import "./micro-polish.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  metadataBase: new URL("https://d4d5d6.com"),
  alternates: { canonical: "/" },
  title: { default: "Le Hibou Rusé", template: "%s — Le Hibou Rusé" },
  description: "Fiscalité, argent et patrimoine : comprendre les règles, exploiter les failles et explorer des montages du D4 au D6.",
  openGraph: {
    title: "Le Hibou Rusé",
    description: "Des stratégies optimisées, ingénieuses, parfois agressives. Cas concrets, chiffres et risques explicités.",
    url: "/",
    siteName: "Le Hibou Rusé",
    locale: "fr_FR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}<Analytics /></body>
    </html>
  );
}
