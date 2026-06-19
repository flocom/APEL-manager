import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { EventDeleteButton } from "@/components/event-delete-button";
import { ShareLink } from "@/components/share-link";
import { SlotManager } from "@/components/slot-manager";
import { TaskManager } from "@/components/task-manager";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getAllMembers, getEventWithDetails } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const event = await getEventWithDetails(id);
  if (!event) notFound();

  const canManage = canManageEvents(user);
  const members = await getAllMembers();
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));
  const baseUrl = await getBaseUrl();
  const publicUrl = `${baseUrl}/inscription/${event.shareToken}`;

  const tasks = event.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    leadTimeDays: t.leadTimeDays,
    dueAt: t.dueAt.toISOString(),
    status: t.status,
    assigneeIds: t.assignees.map((a) => a.userId),
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
    <div className="space-y-6">
      <Link
        href="/dashboard/events"
        className="text-sm text-brand-600 hover:underline"
      >
        ← Retour aux événements
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{event.title}</h1>
              <Badge color={EVENT_STATUS_COLORS[event.status]}>
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
            </div>
            <p className="mt-1 font-medium text-brand-700">
              {formatDateTime(event.startAt)}
              {event.endAt ? ` → ${formatDateTime(event.endAt)}` : ""}
            </p>
            {event.location && (
              <p className="text-sm text-slate-500">📍 {event.location}</p>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Link
                href={`/dashboard/events/${event.id}/edit`}
                className={buttonClasses("outline", "sm")}
              >
                Modifier
              </Link>
              <EventDeleteButton eventId={event.id} />
            </div>
          )}
        </div>
        {event.description && (
          <p className="mt-4 whitespace-pre-line text-sm text-slate-600">
            {event.description}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Lien public d'inscription des bénévoles
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Partagez ce lien : les bénévoles s'inscrivent sans avoir besoin de
          compte.
        </p>
        <ShareLink url={publicUrl} />
      </Card>

      <Card className="p-6">
        <TaskManager
          eventId={event.id}
          tasks={tasks}
          members={memberOptions}
          canManage={canManage}
          currentUserId={user.id}
        />
      </Card>

      <Card className="p-6">
        <SlotManager eventId={event.id} slots={slots} canManage={canManage} />
      </Card>
    </div>
  );
}
