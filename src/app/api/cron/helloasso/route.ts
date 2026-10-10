import { NextResponse } from "next/server";

import { rejectUnauthorizedCron } from "@/lib/auth/cron";
import { HttpError } from "@/lib/auth/guards";
import { redactError } from "@/lib/errors";
import {
  isHelloAssoSyncReady,
  syncHelloAsso,
} from "@/lib/services/helloasso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Synchronisation planifiée des adhésions HelloAsso : une fois par jour sur
 * Vercel (vercel.json), toutes les heures par défaut sous Docker
 * (`HELLOASSO_SYNC_INTERVAL_MINUTES` du conteneur `scheduler`).
 *
 * Sans clés d'API ou sans formulaire dans « Comment régler », elle passe son
 * tour (200 `{ skipped }`) : la plupart des installations n'utilisent pas
 * HelloAsso, et ce n'est pas une panne. La réponse ne porte que des nombres.
 */
export async function GET(req: Request) {
  const refus = rejectUnauthorizedCron(req);
  if (refus) return refus;

  try {
    const ready = await isHelloAssoSyncReady();
    if (!ready.ready) {
      return NextResponse.json({ ok: true, skipped: ready.reason });
    }
    const { summary } = await syncHelloAsso({
      trigger: "scheduled",
      actor: null,
    });
    return NextResponse.json({
      ok: true,
      schoolYear: summary.schoolYear,
      fetched: summary.fetched,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      review: summary.review.length,
    });
  } catch (error) {
    // L'échec est déjà consigné pour l'écran (`lastSyncStatus`) ; le message
    // d'une HttpError est rédigé pour être lu, le reste est réduit.
    if (error instanceof HttpError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message = redactError(error).split("\n")[0];
    console.error("[cron] synchronisation HelloAsso", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
