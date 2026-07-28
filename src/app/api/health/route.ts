import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getRuntimeVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const version = getRuntimeVersion();

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      {
        status: "ok",
        database: "up",
        latencyMs: Date.now() - startedAt,
        version: version.version,
        revision: version.shortRevision || null,
        buildTime: version.buildTime,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error(
      "Échec du contrôle de santé PostgreSQL :",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        status: "unavailable",
        database: "down",
        version: version.version,
        revision: version.shortRevision || null,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
