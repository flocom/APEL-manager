import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import type { HelloAssoSyncResult } from "@/lib/helloasso/types";
import { webAuditActor } from "@/lib/services/audit";
import {
  assertHelloAssoSyncAllowed,
  syncHelloAsso,
} from "@/lib/services/helloasso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** « Synchroniser maintenant » : corps `{}`, réponse `HelloAssoSyncResult`. */
export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    z.object({}).parse(await req.json());
    await assertHelloAssoSyncAllowed(user.id);
    const result: HelloAssoSyncResult = await syncHelloAsso({
      trigger: "manual",
      actor: webAuditActor(user.id, req),
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
