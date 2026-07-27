import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { NavigationProgress } from "@/components/navigation-progress";
import { ToastProvider } from "@/components/toast";
import { APP_NAME, SCHOOL_NAME } from "@/lib/app-config";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const description = `Agenda des événements, check-lists de préparation et inscriptions des bénévoles de l'APEL de l'${SCHOOL_NAME}.`;

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description,
  openGraph: {
    title: APP_NAME,
    description,
    siteName: APP_NAME,
    type: "website",
    locale: "fr_FR",
  },
  twitter: { card: "summary" },
  icons: {
    icon: "/site-icon.png",
    apple: "/site-icon.png",
  },
};

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
