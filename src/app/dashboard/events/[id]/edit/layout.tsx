import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";
import { getEventById } from "@/lib/data";

/**
 * Vérifie que l'événement existe AVANT le squelette de chargement du
 * formulaire : levé sous cette frontière, `notFound()` arrivait après le
 * début de la réponse, partie en 200. Ici, c'est un vrai 404.
 *
 * `getEventById` est mis en cache par requête : la page le relit sans
 * nouvelle requête. Le rôle passe d'abord, pour ne rien dire de l'existence
 * d'un événement à qui ne peut pas le modifier.
 */
export default async function EditEventLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  await requireRole("manager");
  const { id } = await params;
  if (!(await getEventById(id))) notFound();
  return children;
}
