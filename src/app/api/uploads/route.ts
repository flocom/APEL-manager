import { NextResponse } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import { brandingLogoProblem } from "@/lib/notifications/logo";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import {
  removeUpload,
  saveUpload,
  type UploadScope,
} from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeSchema = z.enum(["accounting", "document", "branding"]);

/** Le logo est public : seul un administrateur peut le remplacer. */
const scopeRole = {
  accounting: "admin",
  branding: "admin",
  document: "manager",
} as const;

export async function POST(req: Request) {
  try {
    await requireApiRole("manager");
    const form = await req.formData();
    const scope = scopeSchema.parse(form.get("scope")) as UploadScope;
    const user = await requireApiRole(scopeRole[scope]);
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "Sélectionnez un fichier.");
    }

    const saved = await saveUpload(scope, file);
    if (scope === "branding") {
      // Le logo part aussi en tête des e-mails, converti en PNG. Un fichier que
      // cette conversion ne sait pas lire y serait une image cassée, ou
      // manquerait sans que rien ne le dise : on le refuse ici, pendant que
      // l'administrateur peut encore en choisir un autre.
      const refus = await brandingLogoProblem(
        Buffer.from(await file.arrayBuffer()),
        saved.contentType,
      );
      if (refus) {
        await removeUpload(saved.id);
        throw new HttpError(415, refus);
      }
    }
    try {
      await recordAudit(
        webAuditActor(user.id, req),
        "upload.create",
        "stored_file",
        saved.id,
        {
          scope,
          filename: saved.filename,
          contentType: saved.contentType,
          size: saved.size,
        },
      );
    } catch (error) {
      await removeUpload(saved.id);
      throw error;
    }

    return NextResponse.json({ ok: true, file: saved }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
