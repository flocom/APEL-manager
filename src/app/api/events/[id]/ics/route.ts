import { NextResponse } from "next/server";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { getEventById } from "@/lib/data";
import { buildEventIcs } from "@/lib/ics";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { id } = await params;
    const event = await getEventById(id);
    if (!event) {
      return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });
    }

    const ics = buildEventIcs({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: event.startAt,
      endAt: event.endAt,
    });

    const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug || id}.ics"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
