import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Role } from "@/lib/db/schema";

import { REQUESTED_PATH_HEADER, withNextPath } from "./return-path";
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
 * La page demandée, telle que le middleware l'a recopiée. `null` hors requête
 * (rendu statique, travail différé) : il n'y a alors aucune page où revenir.
 */
async function requestedPath(): Promise<string | null> {
  try {
    return (await headers()).get(REQUESTED_PATH_HEADER);
  } catch {
    return null;
  }
}

/**
 * Pour les Server Components : redirige vers /login si non connecté, en
 * emportant la page demandée pour y revenir une fois connecté — c'est ce qui
 * fait aboutir le lien d'un e-mail ouvert sans session. Un compte connecté
 * mais pas encore validé va sur la page d'attente.
 *
 * Le layout du tableau de bord l'appelle, mais chaque page aussi : Next peut
 * rendre une page sans rejouer le layout (navigation côté client), et c'est
 * la page qui charge les données. La garde doit donc tenir à ce niveau-là.
 */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect(withNextPath("/login", await requestedPath()));
  if (!isApproved(user)) redirect(PENDING_ACCOUNT_PATH);
  return user;
}

/** Pour les Server Components : redirige si le rôle est insuffisant. */
export async function requireRole(min: Role): Promise<SafeUser> {
  const user = await requireUser();
  if (!hasRole(user, min)) redirect("/dashboard");
  return user;
}
