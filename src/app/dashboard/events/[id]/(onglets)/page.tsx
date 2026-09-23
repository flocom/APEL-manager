import {
  ClipboardCheck,
  CopyPlus,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  Paperclip,
  Pencil,
  Ticket,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventAttachmentsManager } from "@/components/event-attachments-manager";
import { OverviewLink, SectionHeading } from "@/components/event-detail";
import { EventReuseActions } from "@/components/event-reuse-actions";
import { FormattedText } from "@/components/formatted-text";
import { TICKETING_KIND_ICONS } from "@/components/ticketing-kind-icon";
import { buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import {
  getChecklistTemplates,
  getEventWithDetails,
} from "@/lib/data";
import { toDatetimeLocal } from "@/lib/dates";
import { listEventAttachments } from "@/lib/services/event-attachments";
import {
  effectiveTicketingKind,
  TICKETING_GENERIC_TITLE,
  ticketingKindOrigin,
  ticketingWording,
} from "@/lib/ticketing";

export const dynamic = "force-dynamic";

/**
 * L'onglet « Aperçu » : l'état d'avancement d'un coup d'œil, les informations
 * de l'événement, ses pièces jointes et les gestes de réutilisation.
 *
 * C'est la page par défaut de la fiche : son adresse n'a pas de segment, et
 * c'est elle qu'on atteint en ouvrant `/dashboard/events/[id]`.
 */
export default async function ApercuPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { id } = await params;
  // Les onglets étaient des paramètres de requête, et ces adresses vivent
  // encore dans des e-mails déjà partis. On les renvoie vers leur route.
  const ancienOnglet = (await searchParams).onglet;
  if (
    ancienOnglet === "preparation" ||
    ancienOnglet === "benevoles" ||
    ancienOnglet === "presences" ||
    ancienOnglet === "budget"
  ) {
    redirect(`/dashboard/events/${id}/${ancienOnglet}`);
  }
  const [user, event] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
  ]);
  if (!event) notFound();

  const canManage = canManageEvents(user);
  // Les pièces jointes (devis, attestations, plans) sont réservées aux
  // organisateurs, comme leur API et le téléchargement des fichiers : un
  // membre recevait la liste et des liens qui lui répondaient 403. On ne la
  // charge donc même pas pour lui.
  const [attachments, templates] = await Promise.all([
    canManage ? listEventAttachments(event.id) : Promise.resolve([]),
    canManage ? getChecklistTemplates() : Promise.resolve([]),
  ]);

  // Un événement se rejoue le plus souvent l'année suivante : la copie propose
  // cette date, modifiable avant validation.
  const nextYearStart = new Date(event.startAt);
  nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
  const nextYearStartAt = toDatetimeLocal(nextYearStart);

  const totalSignups = event.volunteerSlots.reduce(
    (sum, s) => sum + s.signups.length,
    0,
  );
  const remainingPlaces = event.volunteerSlots.reduce(
    (sum, slot) => sum + Math.max(0, slot.capacity - slot.signups.length),
    0,
  );
  const completedTaskCount = event.tasks.filter(
    (task) => task.status === "done",
  ).length;
  const openTaskCount = event.tasks.length - completedTaskCount;
  const tasksToStart = event.tasks.filter(
    (task) => task.status !== "done" && task.dueAt <= new Date(),
  ).length;

  // La carte porte le nom que voient les familles — « Boutique en ligne » —
  // et dit d'où il vient : un organisateur qui lit « Billetterie » sous sa
  // vente de sapins sait qu'il doit corriger l'usage dans le formulaire.
  const usageLien = event.ticketingUrl
    ? effectiveTicketingKind(event.ticketingUrl, event.ticketingKind)
    : null;
  const libellesLien = usageLien ? ticketingWording(usageLien) : null;
  const IconeLien = usageLien ? TICKETING_KIND_ICONS[usageLien] : Ticket;
  // Même phrase que sous la liste du formulaire, alerte comprise : un choix
  // manuel qui contredit l'adresse doit se voir ici, où l'on relit.
  const origineUsage = ticketingKindOrigin(
    event.ticketingKind,
    event.ticketingUrl,
  );

  return (
      <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <OverviewLink
          href={`/dashboard/events/${event.id}/preparation`}
          icon={ClipboardCheck}
          label="Préparation"
          value={
            event.tasks.length === 0
              ? "À configurer"
              : `${completedTaskCount}/${event.tasks.length} terminées`
          }
          hint={
            tasksToStart > 0
              ? `${tasksToStart} à démarrer maintenant`
              : openTaskCount > 0
              ? `${openTaskCount} tâche${openTaskCount > 1 ? "s" : ""} restante${openTaskCount > 1 ? "s" : ""}`
              : "Tout est prêt"
          }
          progress={
            event.tasks.length > 0
              ? Math.round(
                  (completedTaskCount / event.tasks.length) * 100,
                )
              : 0
          }
        />
        <OverviewLink
          href={`/dashboard/events/${event.id}/benevoles`}
          icon={UserRoundPlus}
          label="Bénévoles"
          value={`${totalSignups} inscription${totalSignups > 1 ? "s" : ""}`}
          hint={`${event.volunteerSlots.length} créneau${event.volunteerSlots.length > 1 ? "x" : ""} · ${remainingPlaces} place${remainingPlaces > 1 ? "s" : ""} libre${remainingPlaces > 1 ? "s" : ""}`}
        />
        <OverviewLink
          href={`/dashboard/events/${event.id}/benevoles`}
          icon={Link2}
          label="Page d’inscription"
          value={
            // L'annulation prime : la page publique refuse désormais toute
            // inscription, annoncer « accessible » serait faux.
            event.cancelledAt
              ? "Fermée"
              : event.status === "published"
                ? "Accessible"
                : "Non publiée"
          }
          hint={
            event.cancelledAt
              ? "Le rendez-vous est annulé"
              : event.status === "published"
                ? "Le lien peut être partagé"
                : "Publiez l’événement pour ouvrir le lien"
          }
        />
      </div>

      <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">Notes internes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Lisibles uniquement ici, par les membres connectés.
              </p>
            </div>
          </div>
          {canManage && (
            <Link
              href={`/dashboard/events/${event.id}/edit`}
              className={buttonClasses("outline", "sm")}
            >
              <Pencil className="h-4 w-4" />
              Modifier les informations
            </Link>
          )}
        </div>
        {event.description ? (
          <FormattedText
            text={event.description}
            className="mt-5 max-w-4xl rounded-xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700"
          />
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Aucune note interne pour le moment.
          </p>
        )}
      </Card>

      <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-800">
              <Globe className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">
                Description publique
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {event.status === "published"
                  ? "Visible de tous sur l’accueil du site et sur la page d’inscription."
                  : "Sera visible de tous dès la publication de l’événement."}
              </p>
            </div>
          </div>
        </div>
        {event.publicDescription ? (
          <FormattedText
            text={event.publicDescription}
            className="mt-5 max-w-4xl rounded-xl bg-brand-50 px-4 py-3 text-sm leading-7 text-slate-700"
          />
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Aucune description publique : les visiteurs ne verront que le
            titre, la date et le lieu.
          </p>
        )}

        {/* Lecture seule, et volontairement pas de bouton « copier » : le
            lien qui doit circuler est celui de la page publique, qui porte
            les deux démarches. Rien pour une réunion : elle n'a pas de lien,
            et le formulaire ne propose pas d'en saisir. */}
        {event.kind !== "meeting" && (
          <div className="mt-5 border-t-2 border-slate-100 pt-5">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <IconeLien className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              {libellesLien ? libellesLien.badge : TICKETING_GENERIC_TITLE}
            </p>
            {event.ticketingUrl && libellesLien ? (
              <>
                <p className="mt-1 text-sm text-slate-500">
                  Les familles voient «&nbsp;{libellesLien.titre}&nbsp;».
                  {!origineUsage.contradiction && ` ${origineUsage.texte}`}
                </p>
                {origineUsage.contradiction && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-coral-800">
                    <TriangleAlert
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    {origineUsage.texte}
                  </p>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="break-all">{event.ticketingUrl}</span>
                  <a
                    href={event.ticketingUrl}
                    target="_blank"
                    rel="noopener noreferrer external"
                    className="inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-700 underline"
                  >
                    Vérifier
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"> (ouvre un nouvel onglet)</span>
                  </a>
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Aucun lien : la page publique ne propose que les créneaux de
                bénévoles.
              </p>
            )}
          </div>
        )}
      </Card>
      {canManage && (
        <>
          <SectionHeading
            icon={Paperclip}
            title="Pièces jointes"
            description="Devis, affiches, attestations et plans de salle rattachés à l’événement."
          />
          <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
            <EventAttachmentsManager
              eventId={event.id}
              attachments={attachments.map((attachment) => ({
                id: attachment.id,
                label: attachment.label,
                fileUrl: attachment.fileUrl,
                uploaderName: attachment.uploaderName,
                createdAt: attachment.createdAt.toISOString(),
              }))}
              canManage={canManage}
            />
          </Card>
        </>
      )}

      {canManage && (
        <>
          <SectionHeading
            icon={CopyPlus}
            title="Réutiliser cet événement"
            description="Versez sa check-list dans un modèle, ou rejouez-le à une autre date."
          />
          <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
            <EventReuseActions
              eventId={event.id}
              eventTitle={event.title}
              taskCount={event.tasks.length}
              slotCount={event.volunteerSlots.length}
              templates={templates.map((template) => ({
                id: template.id,
                name: template.name,
                taskCount: template.tasks.length,
                version: template.version,
              }))}
              defaultStartAt={nextYearStartAt}
            />
          </Card>
        </>
      )}
      </div>
  );
}
