import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/auth/guards";
import { clientIpAddress } from "@/lib/client-ip";
import type { MemberInfoField } from "@/lib/member-info/completeness";
import { submitPublicMemberUpdate } from "@/lib/services/member-update-requests";
import {
  delaiLisible,
  hitRateLimit,
  ipKey,
  PLAFONDS,
  rateLimitError,
} from "@/lib/services/rate-limit";
import { hashToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * Enregistrement du formulaire public `/adhesion/[token]`, sans session : le
 * lien reçu par e-mail fait office de preuve. Corps : `PublicMemberUpdateInput`.
 *
 * Un lien expiré, révoqué ou inconnu reçoit la même réponse (404, même
 * message). Les plafonds passent avant : par connexion, puis par lien.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const ip = clientIpAddress(req);

    const parConnexion = await hitRateLimit(PLAFONDS.adhesionIpHeure, ipKey(ip));
    if (!parConnexion.ok) {
      throw rateLimitError(
        parConnexion,
        `Trop d’enregistrements depuis cette connexion : réessayez ${delaiLisible(parConnexion.retryAfterSeconds)}.`,
      );
    }
    // L'empreinte, jamais le jeton : le limiteur la hache encore à sa façon.
    const parLien = await hitRateLimit(
      PLAFONDS.adhesionJetonHeure,
      hashToken(String(token)),
    );
    if (!parLien.ok) {
      throw rateLimitError(
        parLien,
        `Cette fiche vient d’être enregistrée plusieurs fois : réessayez ${delaiLisible(parLien.retryAfterSeconds)}.`,
      );
    }

    const { missing }: { missing: MemberInfoField[] } =
      await submitPublicMemberUpdate(token, await req.json(), {
        ipAddress: ip,
      });
    return NextResponse.json(
      { ok: true, missing },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
