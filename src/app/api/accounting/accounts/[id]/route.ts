import { NextResponse } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import {
  getFinancialAccount,
  updateFinancialAccount,
} from "@/lib/services/accounting";
import { webAuditActor } from "@/lib/services/audit";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string) {
  return z.string().uuid("Identifiant de compte invalide.").parse(id);
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const { id: rawId } = await params;
    const id = parseId(rawId);
    const account = await getFinancialAccount(id);
    if (!account) {
      throw new HttpError(404, "Compte de trésorerie introuvable.");
    }
    return NextResponse.json({ account });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id: rawId } = await params;
    const id = parseId(rawId);
    const account = await updateFinancialAccount(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    return handleApiError(error);
  }
}
