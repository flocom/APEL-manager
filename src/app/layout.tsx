import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import { NavigationProgress } from "@/components/navigation-progress";
import { ToastProvider } from "@/components/toast";
import { SCRIPT_WEB_ANALYTICS, jetonWebAnalytics } from "@/lib/cloudflare-web-analytics";
import { getAssociationSettings } from "@/lib/services/association-settings";

import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAssociationSettings();
  const description = `${settings.associationName} — agenda des événements, check-lists de préparation et inscriptions des bénévoles${
    settings.schoolName ? ` de ${settings.schoolName}` : ""
  }.`;

  return {
    metadataBase: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
      ? new URL(
          process.env.APP_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            "http://localhost:3000",
        )
      : undefined,
    title: {
      default: settings.associationName,
      template: `%s · ${settings.associationName}`,
    },
    description,
    openGraph: {
      title: settings.associationName,
      description,
      siteName: settings.associationName,
      type: "website",
      locale: "fr_FR",
    },
    twitter: { card: "summary" },
    icons: {
      icon: settings.logoUrl || "/logo.svg",
      apple: settings.logoUrl || "/logo.svg",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jetonStatistiques = jetonWebAnalytics();
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen bg-[#f4f7f7] font-sans text-slate-950 antialiased">
        <NavigationProgress />
        <ToastProvider>{children}</ToastProvider>
        {/* Les statistiques de Cloudflare, qu'il n'ajoute plus lui-même à une
            page marquée no-transform (lib/cloudflare-web-analytics.ts). Next
            l'insère après l'hydratation, depuis ses propres scripts : la CSP
            l'accepte (`'strict-dynamic'`), et il n'y a rien à comparer dans
            le HTML rendu. Chargé une fois : il suit lui-même les navigations
            internes. `crossOrigin` comme le module qui sera chargé, sans quoi
            le navigateur téléchargerait deux fois le script. */}
        {jetonStatistiques ? (
          <Script
            src={SCRIPT_WEB_ANALYTICS}
            type="module"
            crossOrigin="anonymous"
            data-cf-beacon={JSON.stringify({ token: jetonStatistiques })}
          />
        ) : null}
      </body>
    </html>
  );
}
