import { ArrowLeft, PencilLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventForm } from "@/components/event-form";
import { buttonClasses, PageHeader } from "@/components/ui";
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
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/dashboard/events/${event.id}`}
        className={buttonClasses("outline", "sm")}
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à l’événement
      </Link>
      <PageHeader
        title="Modifier l’événement"
        description="Avancez section par section. Les informations peuvent être modifiées à tout moment."
        icon={PencilLine}
      />
      <EventForm event={event} />
    </div>
  );
}
