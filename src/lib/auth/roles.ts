import type { Role } from "@/lib/db/schema";

// Helpers de rôles « purs » (sans dépendance serveur), donc utilisables aussi
// bien côté serveur que dans les composants clients.

const roleRank: Record<Role, number> = {
  member: 1,
  manager: 2,
  admin: 3,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Organisateur",
  member: "Membre",
};

export function hasRole(
  user: { role: Role } | null | undefined,
  min: Role,
): boolean {
  if (!user) return false;
  return roleRank[user.role] >= roleRank[min];
}

/**
 * Compte validé par un administrateur. Un compte en attente peut se connecter,
 * mais ne voit que la page qui le lui dit : sans cette étape, quiconque
 * s'inscrivait obtenait d'office le rôle « membre », et avec lui les notes
 * internes et l'annuaire de l'équipe.
 */
export function isApproved(
  user: { approvedAt: Date | string | null } | null | undefined,
): boolean {
  return Boolean(user?.approvedAt);
}

/** Peut créer / modifier les événements, tâches et créneaux bénévoles. */
export function canManageEvents(user: { role: Role } | null | undefined) {
  return hasRole(user, "manager");
}

/** Peut gérer les comptes et les rôles. */
export function canManageUsers(user: { role: Role } | null | undefined) {
  return hasRole(user, "admin");
}
