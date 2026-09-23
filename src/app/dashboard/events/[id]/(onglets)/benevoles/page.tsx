import { Download, Link2, Mail, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { BroadcastForm } from "@/components/broadcast-form";
import { SectionHeading } from "@/components/event-detail";
import { ShareLink } from "@/components/share-link";
import { SlotManager, type SlotItemData } from "@/components/slot-manager";
import { buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { displayBaseUrl } from "@/lib/base-url";
import { getEventWithDetails } from "@/lib/data";

export const dynamic = "force-dynamic";

/** L'onglet « Bénévoles » : les créneaux, le lien public et les inscrits. */
export default async function BenevolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, event, baseUrl] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
    // Adresse affichée à l'organisateur, jamais envoyée : le repli sur la
    // requête ne trompe que qui l'a forgée (voir lib/base-url.ts).
    displayBaseUrl(),
  ]);
  if (!event) notFound();

  const canManage = canManageEvents(user);
  const publicUrl = `${baseUrl}/inscription/${event.shareToken}`;
  const totalSignups = event.volunteerSlots.reduce(
    (sum, s) => sum + s.signups.length,
    0,
  );
  // Les créneaux sont recopiés colonne par colonne : passer l'objet entier
  // enverrait au navigateur le jeton d'annulation de chaque bénévole.
  //
  // Les coordonnées ne partent que chez les organisateurs, comme l'export CSV
  // et l'API des inscriptions. Un membre voit qui vient, pas comment joindre
  // les familles : ce sont des parents qui ont laissé leur numéro à l'équipe
  // qui organise, pas à tous les comptes de l'application.
  const slots: SlotItemData[] = event.volunteerSlots.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    capacity: s.capacity,
    startAt: s.startAt ? s.startAt.toISOString() : null,
    endAt: s.endAt ? s.endAt.toISOString() : null,
    signups: s.signups.map((g) =>
      canManage
        ? { id: g.id, name: g.name, contact: { email: g.email, phone: g.phone } }
        : { id: g.id, name: g.name },
    ),
  }));

  return (
    <div className="space-y-5">
      <SectionHeading
        icon={UsersRound}
        title="Bénévoles et inscriptions"
        description="Créez les créneaux, partagez le lien et suivez les inscriptions."
      />

      <Card className="!rounded-2xl !border-brand-200 !bg-brand-50 !shadow-none p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-slate-950">
              Lien public d’inscription
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {event.status === "published"
                ? "Copiez ce lien pour inviter les familles et bénévoles."
                : "Le lien est prêt, mais restera fermé tant que l’événement est en brouillon."}
            </p>
          </div>
        </div>
        <ShareLink url={publicUrl} />
      </Card>

      <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
        <SlotManager eventId={event.id} slots={slots} canManage={canManage} />
      </Card>

      {canManage && totalSignups > 0 && (
        <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
          <SectionHeading
            icon={Mail}
            title="Contacter les bénévoles"
            description="Exportez la liste ou envoyez un message aux personnes inscrites."
            compact
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/api/events/${event.id}/signups`}
              className={buttonClasses("outline", "sm")}
            >
              <Download className="h-4 w-4" />
              Exporter en CSV
            </a>
            <BroadcastForm
              endpoint={`/api/events/${event.id}/message`}
              title="Écrire aux bénévoles"
              hint="Envoyer un e-mail à tous les bénévoles inscrits ayant laissé une adresse."
            />
          </div>
        </Card>
      )}
    </div>
  );
}
