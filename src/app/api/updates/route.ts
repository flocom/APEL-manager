import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { getUpdateStatus } from "@/lib/services/updates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiRole("admin");
    const force =
      new URL(request.url).searchParams.get("refresh") === "1";
    const status = await getUpdateStatus({ force });
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
