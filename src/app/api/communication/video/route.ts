import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { classVideoContentSchema } from "@/lib/communication/class-video";
import { webAuditActor } from "@/lib/services/audit";
import {
  getClassVideo,
  getClassVideoSource,
  getTtsSettings,
  saveClassVideo,
} from "@/lib/services/communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiRole("admin");
    const [video, source, tts] = await Promise.all([
      getClassVideo(),
      getClassVideoSource(),
      getTtsSettings(),
    ]);
    return NextResponse.json({ ...video, source, tts });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const content = classVideoContentSchema.parse(await req.json());
    const saved = await saveClassVideo(content, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
