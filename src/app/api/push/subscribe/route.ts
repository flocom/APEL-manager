import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { removeSubscription, saveSubscription } from "@/lib/services/push";

export const dynamic = "force-dynamic";

const schema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(10).max(500),
  auth: z.string().min(5).max(500),
  deviceLabel: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const data = schema.parse(await req.json());
    await saveSubscription({ userId: user.id, ...data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser();
    const { endpoint } = z
      .object({ endpoint: z.string().url().max(2000) })
      .parse(await req.json());
    await removeSubscription(endpoint, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
