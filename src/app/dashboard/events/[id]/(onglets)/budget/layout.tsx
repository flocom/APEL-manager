import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/rbac";

/**
 * Le budget est réservé aux administrateurs. Vérifié ici, hors du squelette
 * de chargement de l'onglet, pour que l'adresse réponde un vrai 404 et non
 * une page « introuvable » servie en 200.
 */
export default async function BudgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return children;
}
