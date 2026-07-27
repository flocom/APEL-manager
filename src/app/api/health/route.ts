import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      {
        status: "ok",
        database: "up",
        latencyMs: Date.now() - startedAt,
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
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
