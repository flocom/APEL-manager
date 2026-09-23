import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { hasRole } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { redactError } from "@/lib/errors";
import { getRuntimeVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Contrôle de santé.
 *
 * Sans session, il ne dit que « vivant ou pas » — c'est tout ce dont Docker,
 * Caddy et un superviseur externe ont besoin. Il donnait aussi la version, la
 * révision et la date de construction : de quoi repérer, depuis Internet, les
 * instances restées sur une version vulnérable.
 *
 * Un administrateur connecté obtient le détail : c'est ce que lit la carte
 * « Version et mises à jour » pendant une installation, pour voir la révision
 * changer (components/update-status-card.tsx). Son navigateur envoie le
 * cookie de session avec l'appel, rien d'autre à faire.
 */
async function detailsVisibles(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    return Boolean(user?.approvedAt) && hasRole(user, "admin");
  } catch {
    return false;
  }
}

export async function GET() {
  const startedAt = Date.now();
  const headers = { "Cache-Control": "no-store" };

  try {
    await db.execute(sql`select 1`);
    if (!(await detailsVisibles())) {
      return NextResponse.json({ status: "ok" }, { headers });
    }
    const version = getRuntimeVersion();
    return NextResponse.json(
      {
        status: "ok",
        database: "up",
        latencyMs: Date.now() - startedAt,
        version: version.version,
        revision: version.shortRevision || null,
        buildTime: version.buildTime,
      },
      { headers },
    );
  } catch (error) {
    console.error(
      "Échec du contrôle de santé PostgreSQL :",
      redactError(error),
    );
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
