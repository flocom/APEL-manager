import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ToastProvider } from "@/components/toast";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "APEL Manager",
    template: "%s · APEL Manager",
  },
  description:
    "Gestion des événements, des tâches et des bénévoles de l'APEL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
