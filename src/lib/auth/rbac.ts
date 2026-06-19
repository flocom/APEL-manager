import { redirect } from "next/navigation";

import type { Role } from "@/lib/db/schema";

import {
  canManageEvents,
  canManageUsers,
  hasRole,
  ROLE_LABELS,
} from "./roles";
import { getCurrentUser, type SafeUser } from "./session";

// Ré-export des helpers purs pour que les composants serveur puissent tout
// importer depuis "@/lib/auth/rbac". Les composants clients doivent importer
// depuis "@/lib/auth/roles" (qui n'a aucune dépendance serveur).
export { canManageEvents, canManageUsers, hasRole, ROLE_LABELS };

/** Pour les Server Components : redirige vers /login si non connecté. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Pour les Server Components : redirige si le rôle est insuffisant. */
export async function requireRole(min: Role): Promise<SafeUser> {
  const user = await requireUser();
  if (!hasRole(user, min)) redirect("/dashboard");
  return user;
}
