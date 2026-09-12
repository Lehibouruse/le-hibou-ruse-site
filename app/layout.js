import "./globals.css";

export const metadata = {
  title: "Le Hibou Rusé",
  description:
    "Fiscalité, argent, patrimoine et stratégies expliqués simplement.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
