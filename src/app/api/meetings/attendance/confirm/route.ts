import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/auth/guards";
import { confirmerChangementDePresence } from "@/lib/services/meeting-attendance";

const schema = z.object({ token: z.string().min(20).max(2000) });

/**
 * Confirme le changement d'une réponse de présence, depuis le lien reçu par
 * e-mail (voir `demanderConfirmationDuChangement`).
 *
 * Une requête POST envoyée par le bouton de la page, jamais un simple GET sur
 * le lien : les messageries d'entreprise et les antivirus ouvrent les liens
 * des e-mails pour les inspecter, et un GET qui confirmerait ferait le
 * changement à la place du parent, avant même qu'il ait lu le message.
 */
export async function POST(req: Request) {
  try {
    const { token } = schema.parse(await req.json());
    const { status } = await confirmerChangementDePresence(token);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return handleApiError(error);
  }
}
