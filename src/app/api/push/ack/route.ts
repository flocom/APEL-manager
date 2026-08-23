import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/auth/guards";
import { acknowledgeDelivery } from "@/lib/services/push";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10).max(200),
  event: z.enum(["received", "opened"]),
});

/**
 * Accusé de réception envoyé par le service worker. Volontairement ouvert :
 * la notification peut arriver alors qu'aucune session n'est ouverte, et le
 * jeton — à usage unique, propre à un envoi — suffit à savoir de quoi il
 * s'agit. Un jeton inconnu ne fait rien.
 */
export async function POST(req: Request) {
  try {
    const { token, event } = schema.parse(await req.json());
    await acknowledgeDelivery(token, event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
