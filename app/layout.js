import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Le Hibou Rusé",
  description: "Fiscalité, argent et patrimoine : comprendre les règles, exploiter les arbitrages et garder une longueur d’avance.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}<Analytics /></body>
    </html>
  );
}
