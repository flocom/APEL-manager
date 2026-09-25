import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";

import { chargerAdherent } from "./adherent";

/**
 * Vérifie que la fiche existe AVANT le squelette de chargement de la page.
 *
 * `notFound()` levé sous une frontière de chargement arrive trop tard : la
 * réponse est déjà partie en 200, avec le squelette. Levé ici, en dehors de
 * toute frontière, il donne un vrai 404, et l'écran « Fiche adhérent
 * introuvable » (adherents/not-found.tsx). La page relit la fiche sans
 * nouvelle requête (`cache()`).
 *
 * Le rôle est vérifié d'abord : un compte qui n'a pas accès au registre ne
 * doit pas pouvoir distinguer une fiche qui existe d'une qui n'existe pas.
 */
export default async function AdherentLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  await requireRole("admin");
  const { id } = await params;
  if (!(await chargerAdherent(id))) notFound();
  return children;
}
