import { ShieldAlert, Users } from "lucide-react";
import Link from "next/link";

import { BroadcastForm } from "@/components/broadcast-form";
import { MembersTable } from "@/components/members-table";
import { PendingAccounts } from "@/components/pending-accounts";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_LABELS, requireRole } from "@/lib/auth/rbac";
import { getAllMembers } from "@/lib/data";
import { droppedAccountRequestNotices } from "@/lib/labels";
import { countDroppedAccountRequests } from "@/lib/services/account-requests";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const admin = await requireRole("admin");
  const [members, ignorees] = await Promise.all([
    getAllMembers(),
    // Ici quel que soit le mode d'avis choisi : sans récapitulatif quotidien,
    // c'est le seul endroit où un formulaire saturé se remarque.
    countDroppedAccountRequests({
      depuis: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }),
  ]);
  const refus = droppedAccountRequestNotices(ignorees);

  // Les comptes en attente sortent du tableau : ils n'ont pas de rôle à
  // régler, seulement une décision à recevoir, et ils passent en premier.
  const pending = members
    .filter((m) => m.approvedAt === null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    }));
  const serialized = members
    .filter((m) => m.approvedAt !== null)
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description="Gérez les comptes qui accèdent à l'application et leurs niveaux de droits."
        icon={Users}
      />

      <PendingAccounts accounts={pending} />

      {refus.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border-2 border-sand-200 bg-sand-50 px-4 py-3.5 text-sm leading-6 text-slate-700"
        >
          <ShieldAlert
            className="mt-1 h-4 w-4 shrink-0 text-sand-700"
            aria-hidden="true"
          />
          {/* Une ligne par motif : ils ne demandent pas la même chose. Seuls
              les comptes en attente appellent un geste, et le lien ne paraît
              que s'il en reste à traiter. */}
          <div className="min-w-0 space-y-2">
            {refus.map((r) => (
              <p key={r.reason}>
                <strong className="font-semibold text-slate-900">
                  {r.nombre} depuis 24&nbsp;h
                </strong>
                &nbsp;: {r.motif}. {r.explication}
                {r.reason === "comptes_en_attente" && pending.length > 0 && (
                  <>
                    {" "}
                    <Link
                      href="/dashboard/members#comptes-en-attente"
                      className="rounded font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                    >
                      Traiter les comptes en attente
                    </Link>
                  </>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

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
            assignées, s’inscrire comme bénévole.
          </li>
        </ul>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Contacter les utilisateurs
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Envoyer un e-mail à tous les comptes validés.
        </p>
        <BroadcastForm
          endpoint="/api/members/message"
          title="Écrire à tous les utilisateurs"
          hint="Cet e-mail sera envoyé à l'ensemble des comptes validés ; les comptes en attente ne le reçoivent pas."
        />
      </Card>

      <MembersTable members={serialized} currentUserId={admin.id} />
    </div>
  );
}
