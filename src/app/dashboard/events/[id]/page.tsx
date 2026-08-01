import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Download,
  CopyPlus,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Link2,
  type LucideIcon,
  Mail,
  MapPin,
  Paperclip,
  Pencil,
  UserRoundPlus,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplyTemplate } from "@/components/apply-template";
import { AutoRefresh } from "@/components/auto-refresh";
import { BroadcastForm } from "@/components/broadcast-form";
import { EventAttachmentsManager } from "@/components/event-attachments-manager";
import { EventReuseActions } from "@/components/event-reuse-actions";
import { EventDeleteButton } from "@/components/event-delete-button";
import { FormattedText } from "@/components/formatted-text";
import { ShareLink } from "@/components/share-link";
import { SlotManager } from "@/components/slot-manager";
import { TaskManager } from "@/components/task-manager";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getBaseUrl } from "@/lib/base-url";
import {
  getMemberOptions,
  getChecklistTemplates,
  getEventWithDetails,
} from "@/lib/data";
import { formatDateTime, toDatetimeLocal } from "@/lib/dates";
import { formatEurosAbsolute } from "@/lib/money";
import {
  getAccountingSummary,
  listAccountingEntries,
} from "@/lib/services/accounting";
import { listEventAttachments } from "@/lib/services/event-attachments";
import { EVENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const eventStatusBadge = {
  draft: "amber",
  published: "blue",
  archived: "slate",
} as const;

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { id } = await params;
  const requestedTab = (await searchParams).onglet;
  const activeTab =
    requestedTab === "preparation" ||
    requestedTab === "benevoles" ||
    requestedTab === "budget"
      ? requestedTab
      : "apercu";
  // Lectures indépendantes en parallèle (1 RTT au lieu de 3 en série).
  const [user, event, baseUrl] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
    getBaseUrl(),
  ]);
  if (!event) notFound();

  const canManage = canManageEvents(user);
  const canSeeBudget = user.role === "admin";
  const [memberOptions, templates, attachments, budget, budgetEntries] =
    await Promise.all([
      getMemberOptions(),
      canManage ? getChecklistTemplates() : Promise.resolve([]),
      listEventAttachments(event.id),
      canSeeBudget
        ? getAccountingSummary({ eventId: event.id })
        : Promise.resolve(null),
      canSeeBudget
        ? listAccountingEntries(200, { eventId: event.id })
        : Promise.resolve([]),
    ]);
  const publicUrl = `${baseUrl}/inscription/${event.shareToken}`;
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

  const tasks = event.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    leadTimeDays: t.leadTimeDays,
    leadTimeValue: t.leadTimeValue,
    leadTimeUnit: t.leadTimeUnit,
    dueAt: t.dueAt.toISOString(),
    status: t.status,
    assigneeIds: t.assignees.map((a) => a.userId),
    version: t.version,
  }));

  const slots = event.volunteerSlots.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    capacity: s.capacity,
    startAt: s.startAt ? s.startAt.toISOString() : null,
    signups: s.signups.map((g) => ({
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone,
    })),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/events"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les événements
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/events/${event.id}/ics`}
            className={buttonClasses("outline", "sm")}
          >
            <CalendarPlus className="h-4 w-4" />
            Ajouter à l’agenda
          </a>
          {canManage && (
            <Link
              href={`/dashboard/events/${event.id}/edit`}
              className={buttonClasses("primary", "sm")}
            >
              <Pencil className="h-4 w-4" />
              Modifier
            </Link>
          )}
        </div>
      </div>

      <Card className="overflow-hidden !rounded-2xl !shadow-none">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="border-l-4 border-brand-600 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                color={eventStatusBadge[event.status]}
                className="!rounded-md"
              >
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
              <span className="text-xs font-semibold text-slate-400">
                Fiche événement
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5">
              <p className="inline-flex items-start gap-2 font-semibold text-slate-800">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  {formatDateTime(event.startAt)}
                  {event.endAt && (
                    <>
                      <span className="mx-1 text-slate-400">→</span>
                      {formatDateTime(event.endAt)}
                    </>
                  )}
                </span>
              </p>
              {event.location && (
                <p className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-sea-700" />
                  {event.location}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center border-t border-slate-200 bg-slate-50 px-5 py-4 lg:w-56 lg:border-l lg:border-t-0">
            <p className="text-sm leading-6 text-slate-600">
              Utilisez les onglets ci-dessous pour avancer étape par étape,
              sans tout afficher en même temps.
            </p>
          </div>
        </div>
      </Card>

      <EventDetailNav
        eventId={event.id}
        active={activeTab}
        taskCount={event.tasks.length}
        signupCount={totalSignups}
        showBudget={canSeeBudget}
      />

      {activeTab === "apercu" && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <OverviewLink
              href={`/dashboard/events/${event.id}?onglet=preparation`}
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
              href={`/dashboard/events/${event.id}?onglet=benevoles`}
              icon={UserRoundPlus}
              label="Bénévoles"
              value={`${totalSignups} inscription${totalSignups > 1 ? "s" : ""}`}
              hint={`${event.volunteerSlots.length} créneau${event.volunteerSlots.length > 1 ? "x" : ""} · ${remainingPlaces} place${remainingPlaces > 1 ? "s" : ""} libre${remainingPlaces > 1 ? "s" : ""}`}
            />
            <OverviewLink
              href={`/dashboard/events/${event.id}?onglet=benevoles`}
              icon={Link2}
              label="Page d’inscription"
              value={
                event.status === "published" ? "Accessible" : "Non publiée"
              }
              hint={
                event.status === "published"
                  ? "Le lien peut être partagé"
                  : "Publiez l’événement pour ouvrir le lien"
              }
            />
          </div>

          <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-950">
                  Informations utiles
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Le contexte et les consignes visibles par l’équipe.
                </p>
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
                Aucune description pour le moment.
              </p>
            )}
          </Card>

          {canManage && (
            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-500 hover:text-slate-800">
                Options avancées
              </summary>
              <div className="border-t border-slate-200 px-5 py-4">
                <p className="mb-3 text-sm text-slate-500">
                  La suppression efface aussi les tâches, créneaux et
                  inscriptions associés.
                </p>
                <EventDeleteButton eventId={event.id} />
              </div>
            </details>
          )}
        </div>
      )}

      {activeTab === "apercu" && (
        <div className="space-y-5">
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
      )}

      {activeTab === "budget" && budget && (
        <div className="space-y-5">
          <SectionHeading
            icon={Landmark}
            title="Budget de l’événement"
            description="Recettes et dépenses validées rattachées à cet événement."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <BudgetStat label="Recettes" cents={budget.incomeCents} tone="green" />
            <BudgetStat label="Dépenses" cents={budget.expenseCents} tone="red" />
            <BudgetStat
              label="Résultat"
              cents={budget.balanceCents}
              tone={budget.balanceCents >= 0 ? "brand" : "red"}
            />
          </div>
          {budget.draftCount > 0 && (
            <p className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
              {budget.draftCount} écriture(s) en brouillon ne sont pas comptées
              dans ce résultat.
            </p>
          )}
          <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
            {budgetEntries.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune écriture n’est rattachée à cet événement. Depuis
                Comptabilité, choisissez cet événement dans le champ
                « Événement » d’une recette ou d’une dépense.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {budgetEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-brand-950">
                        {entry.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(entry.occurredAt)}
                        {entry.status === "draft" ? " · brouillon" : ""}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 font-black tabular-nums",
                        entry.type === "income"
                          ? "text-emerald-700"
                          : "text-coral-700",
                      )}
                    >
                      {entry.type === "income" ? "+" : "−"}
                      {formatEurosAbsolute(entry.amountCents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {activeTab === "preparation" && (
        <div className="space-y-5">
          <SectionHeading
            icon={ListChecks}
            title="Check-list de préparation"
            description="Organisez les tâches, les responsables et les dates de traitement."
          />

          {canManage && event.tasks.length === 0 && (
            <Card className="!rounded-2xl !border-sea-200 !bg-sea-50 !shadow-none p-5 sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sea-600 text-white">
                  <WandSparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-bold text-slate-950">
                    Commencer depuis un modèle
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Choisissez le type d’événement : les tâches habituelles
                    seront ajoutées automatiquement.
                  </p>
                </div>
              </div>
              <ApplyTemplate
                eventId={event.id}
                templates={templates.map((template) => ({
                  id: template.id,
                  name: template.name,
                  count: template.tasks.length,
                }))}
              />
            </Card>
          )}

          <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
            <TaskManager
              eventId={event.id}
              eventVersion={event.version}
              eventStartAt={event.startAt.toISOString()}
              tasks={tasks}
              members={memberOptions}
              canManage={canManage}
              currentUserId={user.id}
            />
          </Card>
        </div>
      )}

      {activeTab === "benevoles" && (
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
      )}
    </div>
  );
}

function EventDetailNav({
  eventId,
  active,
  taskCount,
  signupCount,
  showBudget,
}: {
  eventId: string;
  active: "apercu" | "preparation" | "benevoles" | "budget";
  taskCount: number;
  signupCount: number;
  showBudget: boolean;
}) {
  const tabs = [
    {
      id: "apercu",
      label: "Aperçu",
      href: `/dashboard/events/${eventId}`,
      icon: LayoutDashboard,
    },
    {
      id: "preparation",
      label: "Préparation",
      href: `/dashboard/events/${eventId}?onglet=preparation`,
      icon: ListChecks,
      count: taskCount,
    },
    {
      id: "benevoles",
      label: "Bénévoles",
      href: `/dashboard/events/${eventId}?onglet=benevoles`,
      icon: UsersRound,
      count: signupCount,
    },
    ...(showBudget
      ? ([
          {
            id: "budget",
            label: "Budget",
            href: `/dashboard/events/${eventId}?onglet=budget`,
            icon: Landmark,
          },
        ] as const)
      : []),
  ] as const;

  return (
    <nav
      aria-label="Sections de l’événement"
      className={cn(
        "grid gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1.5",
        showBudget ? "grid-cols-4" : "grid-cols-3",
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-4",
              selected
                ? "bg-white text-brand-800 shadow-sm"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-950",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="break-words text-center text-xs leading-tight sm:text-sm">
              {tab.label}
            </span>
            {"count" in tab && (
              <span
                className={cn(
                  "grid min-w-6 place-items-center rounded-md px-1.5 py-0.5 text-[11px]",
                  selected
                    ? "bg-brand-100 text-brand-800"
                    : "bg-white text-slate-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function OverviewLink({
  href,
  icon: Icon,
  label,
  value,
  hint,
  progress,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  progress?: number;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <ChevronRight className="mt-2 h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
      </div>
      {progress !== undefined && (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Avancement de la préparation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span
            className="block h-full rounded-full bg-brand-600"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Link>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <div>
        <h2
          className={cn(
            "font-bold text-slate-950",
            compact ? "text-base" : "text-xl",
          )}
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function BudgetStat({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone: "green" | "red" | "brand";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-coral-200 bg-coral-50 text-coral-800",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
  } as const;
  return (
    <div className={cn("rounded-2xl border-2 p-4", tones[tone])}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums">
        {cents < 0 ? "−" : ""}
        {formatEurosAbsolute(cents)}
      </p>
    </div>
  );
}
