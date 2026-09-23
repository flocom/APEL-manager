import { redirect } from "next/navigation";

import type { Role } from "@/lib/db/schema";

import {
  canManageEvents,
  canManageUsers,
  hasRole,
  isApproved,
  ROLE_LABELS,
} from "./roles";
import { getCurrentUser, type SafeUser } from "./session";

// Ré-export des helpers purs pour que les composants serveur puissent tout
// importer depuis "@/lib/auth/rbac". Les composants clients doivent importer
// depuis "@/lib/auth/roles" (qui n'a aucune dépendance serveur).
export { canManageEvents, canManageUsers, hasRole, isApproved, ROLE_LABELS };

/** La page qu'un compte en attente de validation est seul à pouvoir ouvrir. */
export const PENDING_ACCOUNT_PATH = "/compte-en-attente";

/**
 * Pour les Server Components : redirige vers /login si non connecté, et vers
 * la page d'attente si le compte n'est pas encore validé.
 *
 * Le layout du tableau de bord l'appelle, mais chaque page aussi : Next peut
 * rendre une page sans rejouer le layout (navigation côté client), et c'est
 * la page qui charge les données. La garde doit donc tenir à ce niveau-là.
 */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isApproved(user)) redirect(PENDING_ACCOUNT_PATH);
  return user;
}

/** Pour les Server Components : redirige si le rôle est insuffisant. */
export async function requireRole(min: Role): Promise<SafeUser> {
  const user = await requireUser();
  if (!hasRole(user, min)) redirect("/dashboard");
  return user;
}
