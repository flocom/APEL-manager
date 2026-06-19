import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { getEventWithDetails } from "@/lib/data";

type Params = { params: Promise<{ id: string }> };

function csvCell(value: string): string {
  // Neutralise l'injection de formules : une cellule commençant par = + - @ (ou
  // tabulation / retour chariot) est interprétée comme une formule par Excel /
  // Sheets. On la préfixe d'une apostrophe pour la forcer en texte.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    const event = await getEventWithDetails(id);
    if (!event) {
      return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });
    }

    const rows: string[][] = [
      ["Créneau", "Nom", "Email", "Téléphone", "Inscrit le"],
    ];
    for (const slot of event.volunteerSlots) {
      for (const s of slot.signups) {
        rows.push([
          slot.title,
          s.name,
          s.email ?? "",
          s.phone ?? "",
          s.createdAt.toISOString(),
        ]);
      }
    }

    // BOM + séparateur ";" pour une ouverture correcte dans Excel (FR).
    const csv =
      "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");

    const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="benevoles-${slug || id}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
