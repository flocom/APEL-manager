import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  affecterCotisations,
  affectationsDeLEcriture,
} from "@/lib/services/cotisations";

type Params = { params: Promise<{ id: string }> };

/**
 * Ce qu'une écriture couvre en cotisations. Modifiable même lorsque l'écriture
 * est validée : rattacher une adhésion ne change ni le montant, ni la date, ni
 * le compte — c'est une marque de rapprochement, pas une écriture comptable.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const { id } = await params;
    return NextResponse.json({ affectations: await affectationsDeLEcriture(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const affectations = await affecterCotisations(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, affectations });
  } catch (error) {
    return handleApiError(error);
  }
}
