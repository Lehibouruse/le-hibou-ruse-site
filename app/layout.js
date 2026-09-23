import "./globals.css";
import "./revamp.css";
import "./polish.css";
import "./micro-polish.css";
import { Analytics } from "@vercel/analytics/next";
import AttributionCapture from "../components/AttributionCapture";
import { publicSiteOrigin } from "../lib/site-origin.mjs";

const publicOrigin = publicSiteOrigin();

export const metadata = {
  metadataBase: new URL(publicOrigin),
  applicationName: "Le Hibou Rusé",
  title: { default: "Le Hibou Rusé", template: "%s — Le Hibou Rusé" },
  description: "Comprendre les règles. Exploiter les failles. Fiscalité, argent, patrimoine et montages D4 à D6 avec cas concrets, chiffres et risques explicités.",
  keywords: [
    "Le Hibou Rusé",
    "Hibou Rusé",
    "fiscalité",
    "optimisation fiscale",
    "patrimoine",
    "argent",
    "D4 D5 D6",
  ],
  creator: "Le Hibou Rusé",
  publisher: "Le Hibou Rusé",
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Le Hibou Rusé",
  alternateName: ["Hibou Rusé", "Le Hibou Ruse"],
  url: publicOrigin,
  inLanguage: "fr-FR",
  description: metadata.description,
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
        <AttributionCapture />
        <Analytics />
      </body>
    </html>
  );
}
