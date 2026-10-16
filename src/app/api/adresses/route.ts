import { NextResponse } from "next/server";

import type { AddressSearchResponse } from "@/lib/address-types";
import { handleApiError } from "@/lib/auth/guards";
import { clientIpAddress } from "@/lib/client-ip";
import { searchAddresses } from "@/lib/services/address-search";
import {
  delaiLisible,
  hitRateLimit,
  ipKey,
  PLAFONDS,
  rateLimitError,
} from "@/lib/services/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Adresses proposées pendant la frappe : `GET /api/adresses?q=12 rue des lilas`.
 *
 * Sans session : le formulaire public `/adhesion/[token]` s'en sert autant que
 * la fiche adhérent du bureau. Un plafond par connexion l'empêche de servir de
 * relais vers le service de cartographie.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.trim().length < 3) {
      return NextResponse.json({ suggestions: [] } satisfies AddressSearchResponse);
    }
    const verdict = await hitRateLimit(
      PLAFONDS.rechercheAdresse,
      ipKey(clientIpAddress(req)),
    );
    if (!verdict.ok) {
      throw rateLimitError(
        verdict,
        `Trop de recherches d’adresse : réessayez ${delaiLisible(verdict.retryAfterSeconds)}, ou saisissez-la à la main.`,
      );
    }
    const suggestions = await searchAddresses(q);
    return NextResponse.json({ suggestions } satisfies AddressSearchResponse, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
