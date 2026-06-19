import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "APEL Manager",
  description:
    "Gestion des événements, des tâches et des bénévoles de l'APEL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
