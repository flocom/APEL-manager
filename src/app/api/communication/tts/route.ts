import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { saveTtsSettings } from "@/lib/services/communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: z.enum(["openai", "elevenlabs"]).nullable(),
  apiKey: z.string().trim().max(300).nullable().optional(),
  clearKey: z.boolean().optional(),
  voice: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z0-9_-]*$/, "Identifiant de voix invalide.")
    .nullable(),
});

export async function PUT(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const tts = await saveTtsSettings(
      bodySchema.parse(await req.json()),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, tts });
  } catch (error) {
    return handleApiError(error);
  }
}
