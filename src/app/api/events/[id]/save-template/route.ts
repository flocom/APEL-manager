import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { overwriteTemplateFromEvent } from "@/lib/services/events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  templateId: z.string().uuid("Modèle invalide"),
  version: z.coerce.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id: eventId } = await params;
    const { templateId, version } = schema.parse(await req.json());

    const result = await overwriteTemplateFromEvent(
      { eventId, templateId, expectedVersion: version },
      webAuditActor(user.id, req),
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
