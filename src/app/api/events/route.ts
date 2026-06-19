import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
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
        title: data.title,
        description: emptyToNull(data.description),
        location: emptyToNull(data.location),
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        status: data.status,
        shareToken: generateShareToken(),
        createdBy: user.id,
      })
      .returning({ id: events.id });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    return handleApiError(error);
  }
}
