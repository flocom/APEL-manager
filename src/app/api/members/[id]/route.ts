import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { emptyToNull } from "@/lib/utils";
import { memberUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const { id } = await params;
    const data = memberUpdateSchema.parse(await req.json());

    const updates: Partial<typeof users.$inferInsert> = {};
    if (data.role !== undefined) {
      // Un admin ne peut pas se retirer lui-même ses droits (anti-verrouillage).
      if (id === admin.id && data.role !== "admin") {
        throw new HttpError(
          400,
          "Vous ne pouvez pas retirer votre propre rôle administrateur.",
        );
      }
      updates.role = data.role;
    }
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

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const { id } = await params;
    if (id === admin.id) {
      throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte.");
    }
    await db.delete(users).where(eq(users.id, id));
    revalidateTag("members");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
