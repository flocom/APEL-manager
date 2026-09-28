import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { generateVoiceClip } from "@/lib/services/communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(1, "La phrase à lire est vide.").max(600),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const { text } = bodySchema.parse(await req.json());
    const clip = await generateVoiceClip(text, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, ...clip }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
