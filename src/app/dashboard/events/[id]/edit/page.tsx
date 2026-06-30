import Link from "next/link";
import { notFound } from "next/navigation";

import { EventForm } from "@/components/event-form";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { getEventById } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("manager");
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/dashboard/events/${event.id}`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Retour à l'événement
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Modifier l'événement
        </h1>
      </div>
      <Card className="p-6">
        <EventForm event={event} />
      </Card>
    </div>
  );
}
