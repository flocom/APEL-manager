import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { sendPushNotification } from "@/lib/services/push";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(2, "Titre requis").max(80),
  body: z.string().trim().min(2, "Message requis").max(400),
  url: z.string().trim().max(500).optional().or(z.literal("")),
  userIds: z.array(z.string().uuid()).min(1, "Choisissez au moins un membre"),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const data = schema.parse(await req.json());
    const result = await sendPushNotification(
      {
        title: data.title,
        body: data.body,
        url: data.url || null,
        userIds: data.userIds,
      },
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
