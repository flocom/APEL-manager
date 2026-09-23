import { revalidateTag } from "next/cache";
import { NextResponse, after } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/notifications/email";
import { accountApprovedEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { webAuditActor } from "@/lib/services/audit";
import {
  approveAccount,
  parseAccountId,
  refuseAccount,
} from "@/lib/services/user-accounts";

type Params = { params: Promise<{ id: string }> };

/** Valider un compte en attente : il entre avec le rôle « membre ». */
export async function POST(req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const id = parseAccountId((await params).id);
    const approved = await approveAccount(id, webAuditActor(admin.id, req));
    // Le compte validé rejoint les sélecteurs (assignation des tâches…).
    revalidateTag("members");

    // Après la réponse : l'écran de l'administrateur n'a pas à attendre le
    // serveur de courrier, et un envoi raté ne défait pas la validation.
    after(async () => {
      try {
        const [association, baseUrl] = await Promise.all([
          getAssociationSettings(),
          getBaseUrl(),
        ]);
        const parti = await sendEmail({
          to: approved.email,
          ...accountApprovedEmail({
            name: approved.name,
            loginUrl: `${baseUrl}/login`,
            identity: await getNotificationIdentity(association),
          }),
        });
        if (!parti) {
          console.warn(
            `[validation] avis de validation non remis à ${approved.email}.`,
          );
        }
      } catch (erreur) {
        console.error("[validation] avis de validation non envoyé", erreur);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Refuser un compte en attente : il est supprimé. Aucun e-mail ne part.
 * L'adresse a bien été confirmée par son titulaire, mais un « refusé »
 * automatique, signé de l'association, ouvrirait une discussion que le bureau
 * n'a pas choisie : s'il connaît la personne, il la prévient lui-même ; s'il
 * ne la connaît pas, il n'a rien à lui écrire.
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const admin = await requireApiRole("admin");
    const id = parseAccountId((await params).id);
    await refuseAccount(id, webAuditActor(admin.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
