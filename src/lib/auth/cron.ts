import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Contrôle commun des tâches planifiées (`/api/cron/*`) : le Cron Vercel et
 * le conteneur `scheduler` envoient `Authorization: Bearer $CRON_SECRET`.
 *
 * Fail-closed : sans secret configuré, l'endpoint refuse de s'exécuter. La
 * comparaison se fait à temps constant. Renvoie la réponse de refus, ou null
 * si l'appel est autorisé.
 */
export function rejectUnauthorizedCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET n'est pas configuré sur le serveur." },
      { status: 500 },
    );
  }
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}
