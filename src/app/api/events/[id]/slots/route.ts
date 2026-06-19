import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events, volunteerSlots } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { slotSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    const data = slotSchema.parse(await req.json());

    const [slot] = await db
      .insert(volunteerSlots)
      .values({
        eventId,
        title: data.title,
        description: emptyToNull(data.description),
        capacity: data.capacity,
        startAt: data.startAt ?? null,
        endAt: data.endAt ?? null,
      })
      .returning({ id: volunteerSlots.id });

    return NextResponse.json({ ok: true, id: slot.id });
  } catch (error) {
    return handleApiError(error);
  }
}
