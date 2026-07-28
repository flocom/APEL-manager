import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { NavigationProgress } from "@/components/navigation-progress";
import { ToastProvider } from "@/components/toast";
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
  const description = `Agenda des événements, check-lists de préparation et inscriptions des bénévoles de l'APEL de l'${settings.schoolName}.`;

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
      icon: "/site-icon.png",
      apple: "/site-icon.png",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen bg-[#f4f7f7] font-sans text-slate-950 antialiased">
        <NavigationProgress />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
