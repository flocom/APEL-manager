import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { generateShareToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";
import { eventSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("manager");
    const data = eventSchema.parse(await req.json());

    const [created] = await db
      .insert(events)
      .values({
        kind: data.kind,
        title: data.title,
        description: emptyToNull(data.description),
        publicDescription: emptyToNull(data.publicDescription),
        ticketingUrl: data.ticketingUrl ?? null,
        location: emptyToNull(data.location),
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        status: data.status,
        shareToken: generateShareToken(),
        createdBy: user.id,
      })
      .returning({ id: events.id });

    // Comme l'outil MCP `create_event` : un événement publié d'emblée ouvre
    // un lien public, le journal doit pouvoir dire qui l'a créé.
    await recordAudit(
      webAuditActor(user.id, req),
      "event.create",
      "event",
      created.id,
      { status: data.status, kind: data.kind },
    );

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    return handleApiError(error);
  }
}
