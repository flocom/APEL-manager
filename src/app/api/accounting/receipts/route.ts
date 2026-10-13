import { NextResponse } from "next/server";

import { RECEIPTS_PER_UPLOAD } from "@/lib/accounting/receipts";
import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import {
  createReceipts,
  listReceipts,
  receiptView,
} from "@/lib/services/accounting-receipts";
import { webAuditActor } from "@/lib/services/audit";
import { maxUploadBytes } from "@/lib/uploads";

// Les reçus sont écrits sur le disque : il faut Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiRole("admin");
    const rows = await listReceipts();
    return NextResponse.json({ items: rows.map(receiptView) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Dépôt de reçus : formulaire multipart, champ `files` répété. */
export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    // Un lot plus lourd que le plafond par fichier fois le nombre de fichiers
    // n'a aucune chance d'être accepté : inutile de le lire en entier.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > RECEIPTS_PER_UPLOAD * maxUploadBytes() + 1024 * 1024) {
      throw new HttpError(413, "Envoi trop volumineux.");
    }
    // Un corps tronqué en route (proxy, coupure) ne se lit pas : c'est la
    // requête qui est en cause, pas le serveur.
    const form = await req.formData().catch(() => {
      throw new HttpError(
        400,
        `Envoi illisible ou interrompu. Réessayez ; chaque reçu fait au plus ${Math.round(maxUploadBytes() / (1024 * 1024))} Mo.`,
      );
    });
    const entries = form.getAll("files");
    if (entries.some((entry) => !(entry instanceof File))) {
      throw new HttpError(400, "Sélectionnez des fichiers.");
    }
    const rows = await createReceipts(
      entries as File[],
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ items: rows.map(receiptView) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
