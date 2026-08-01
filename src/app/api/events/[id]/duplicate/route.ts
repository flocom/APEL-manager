import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { parseLocalDateTime } from "@/lib/dates";
import { webAuditActor } from "@/lib/services/audit";
import { duplicateEvent } from "@/lib/services/events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  startAt: z.string().min(1, "Date requise").transform((value, ctx) => {
    const date = parseLocalDateTime(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide" });
      return z.NEVER;
    }
    return date;
  }),
  title: z.string().trim().min(2).max(200).nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id: eventId } = await params;
    const { startAt, title } = schema.parse(await req.json());

    const result = await duplicateEvent(
      { eventId, startAt, title },
      webAuditActor(user.id, req),
    );

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
