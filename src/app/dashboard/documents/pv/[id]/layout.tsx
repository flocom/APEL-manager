import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";

import { chargerDocument } from "./document";

/**
 * Vérifie le document AVANT le squelette de chargement de l'éditeur.
 *
 * Sous cette frontière, `notFound()` et `redirect()` arrivaient après le
 * début de la réponse, déjà partie en 200 : une adresse inconnue servait une
 * page « introuvable » en 200, et la redirection passait par le navigateur.
 * Ici, c'est un vrai 404, ou une vraie redirection. La page relit le document
 * sans nouvelle requête (`cache()`).
 */
export default async function PvLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  await requireRole("manager");
  const { id } = await params;
  const document = await chargerDocument(id);
  if (!document) notFound();
  // Un procès-verbal saisi en texte libre garde son formulaire d'origine.
  if (document.type !== "ag_minutes" || !document.payload) {
    redirect("/dashboard/documents");
  }
  return children;
}
