import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  orderedIds: z.array(z.string().uuid()).max(500),
});

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;
    const { orderedIds } = schema.parse(await req.json());

    // Position = rang dans la liste reçue (limité aux tâches de cet événement).
    await Promise.all(
      orderedIds.map((taskId, index) =>
        db
          .update(tasks)
          .set({ position: index })
          .where(and(eq(tasks.id, taskId), eq(tasks.eventId, eventId))),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
