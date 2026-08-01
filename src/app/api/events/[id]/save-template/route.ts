import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { saveEventAsTemplate } from "@/lib/services/events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Absent : un nouveau modèle est créé à partir de l'événement. */
  templateId: z.string().uuid("Modèle invalide").nullable().optional(),
  name: z.string().trim().min(2).max(120).nullable().optional(),
  version: z.coerce.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id: eventId } = await params;
    const { templateId, name, version } = schema.parse(await req.json());

    const result = await saveEventAsTemplate(
      { eventId, templateId, name, expectedVersion: version },
      webAuditActor(user.id, req),
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
