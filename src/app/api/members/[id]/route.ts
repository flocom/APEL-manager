import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { webAuditActor } from "@/lib/services/audit";
import {
  changeUserRole,
  deleteUserAccount,
  parseAccountId,
} from "@/lib/services/user-accounts";
import { emptyToNull } from "@/lib/utils";
import { memberUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const id = parseAccountId((await params).id);
    const data = memberUpdateSchema.parse(await req.json());

    // Le rôle passe par le service : il ferme les sessions et les jetons MCP
    // du compte, et journalise le changement.
    if (data.role !== undefined) {
      const { changed } = await changeUserRole(
        id,
        data.role,
        webAuditActor(admin.id, req),
      );
      if (changed) revalidateTag("members");
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (data.telegramChatId !== undefined) {
      const chatId = emptyToNull(data.telegramChatId);
      // Retirer un identifiant reste toujours possible ; en enregistrer un ne
      // l'est que si le canal fonctionne, sinon il ne recevrait jamais rien.
      if (chatId) {
        const { telegramReady } = await getAssociationSettings();
        if (!telegramReady) {
          throw new HttpError(
            400,
            "Les notifications Telegram ne sont pas disponibles : un administrateur doit activer le canal avec un token de bot confirmé.",
          );
        }
      }
      updates.telegramChatId = chatId;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, id));
      revalidateTag("members");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const id = parseAccountId((await params).id);
    await deleteUserAccount(id, webAuditActor(admin.id, req));
    revalidateTag("members");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
