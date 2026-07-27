import { NextResponse } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import {
  removeUpload,
  saveUpload,
  type UploadScope,
} from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeSchema = z.enum(["accounting", "document"]);

export async function POST(req: Request) {
  try {
    await requireApiRole("manager");
    const form = await req.formData();
    const scope = scopeSchema.parse(form.get("scope")) as UploadScope;
    const user = await requireApiRole(scope === "accounting" ? "admin" : "manager");
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "Sélectionnez un fichier.");
    }

    const saved = await saveUpload(scope, file);
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
