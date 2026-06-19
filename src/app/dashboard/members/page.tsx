import { Users } from "lucide-react";

import { MembersTable } from "@/components/members-table";
import { PageHeader } from "@/components/ui";
import { ROLE_LABELS, requireRole } from "@/lib/auth/rbac";
import { getAllMembers } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const admin = await requireRole("admin");
  const members = await getAllMembers();

  const serialized = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membres"
        description="Gérez les comptes et leurs niveaux de droits."
        icon={Users}
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-700">Niveaux de droits</p>
        <ul className="mt-1 space-y-0.5">
          <li>
            <strong>{ROLE_LABELS.admin}</strong> : tout gérer, y compris les
            comptes et les rôles.
          </li>
          <li>
            <strong>{ROLE_LABELS.manager}</strong> : créer et gérer les
            événements, tâches et créneaux bénévoles.
          </li>
          <li>
            <strong>{ROLE_LABELS.member}</strong> : consulter, gérer ses tâches
            assignées, s'inscrire comme bénévole.
          </li>
        </ul>
      </div>

      <MembersTable members={serialized} currentUserId={admin.id} />
    </div>
  );
}
