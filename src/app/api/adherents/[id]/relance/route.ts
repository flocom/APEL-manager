import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import type {
  MemberSingleRelanceResult,
  MemberUpdateRequestView,
} from "@/lib/member-info/types";
import { webAuditActor } from "@/lib/services/audit";
import {
  listUpdateRequests,
  sendSingleRelance,
} from "@/lib/services/member-update-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Historique des liens envoyés pour cette fiche. */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const { id } = await params;
    const requests: MemberUpdateRequestView[] = await listUpdateRequests(id);
    return NextResponse.json(
      { requests },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** Envoie à la famille un nouveau lien pour compléter sa fiche. */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const result: MemberSingleRelanceResult = await sendSingleRelance(
      id,
      webAuditActor(user.id, req),
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
