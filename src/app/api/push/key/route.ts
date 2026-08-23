import { NextResponse } from "next/server";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { getPushPublicKey } from "@/lib/services/push";

export const dynamic = "force-dynamic";

/** Clé publique VAPID, nécessaire au navigateur pour s'abonner. */
export async function GET() {
  try {
    await requireApiUser();
    return NextResponse.json({ publicKey: await getPushPublicKey() });
  } catch (error) {
    return handleApiError(error);
  }
}
