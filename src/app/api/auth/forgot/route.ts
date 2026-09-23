import { eq } from "drizzle-orm";
import { NextResponse, after } from "next/server";

import { handleApiError } from "@/lib/auth/guards";
import { secureLinkBaseUrl } from "@/lib/base-url";
import { clientIpAddress } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { sendEmail } from "@/lib/notifications/email";
import { passwordResetEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import {
  delaiLisible,
  forgotAddressStages,
  hitRateLimit,
  hitRateLimitStages,
  ipKey,
  PLAFONDS,
  rateLimitError,
} from "@/lib/services/rate-limit";
import { generateToken, hashToken } from "@/lib/tokens";
import { forgotSchema } from "@/lib/validation";

/** Durée de validité d'un lien de réinitialisation. */
const VALIDITE_MS = 60 * 60 * 1000;

/**
 * « Mot de passe oublié ».
 *
 * La réponse est la même, et arrive au même moment, que l'adresse ait un
 * compte ou non : tout le travail qui les distingue — recherche, jeton,
 * e-mail — se fait après elle.
 *
 * Deux sortes de plafonds. Celui de la connexion ne regarde pas l'adresse
 * saisie : son refus peut se dire. Ceux de l'adresse restent muets, sans quoi
 * la réponse dirait qu'elle a déjà servi ; ils empêchent de remplir la boîte
 * de quelqu'un au nom de l'association, et d'épuiser le quota d'envoi.
 *
 * Le plafond serré de l'adresse (quelques liens par heure, un peu plus par
 * jour) se compte depuis chaque connexion ; la boîte elle-même n'a qu'un
 * plafond plus large, toutes connexions confondues. Posé sur l'adresse seule,
 * le plafond serré laissait n'importe qui l'épuiser en six demandes, sans
 * bruit : la personne visée ne recevait plus aucun lien jusqu'au lendemain,
 * alors que c'est son seul recours quand la connexion lui est refusée.
 *
 * Une nouvelle demande n'annule plus les liens déjà partis. Elle le faisait,
 * et n'importe qui pouvait ainsi rendre inutilisable, à chaque minute, le lien
 * qu'une personne venait de recevoir. Plusieurs liens peuvent donc être
 * valables en même temps — au plus quelques-uns, pendant une heure — et le
 * premier qui sert fait tomber les autres (voir /api/auth/reset).
 */
export async function POST(req: Request) {
  try {
    const { email, website } = forgotSchema.parse(await req.json());

    // Robot repéré au champ caché : il lit la même réponse que tout le monde.
    if (website && website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    const ip = ipKey(clientIpAddress(req));
    const parConnexion = await hitRateLimit(PLAFONDS.oubliIp, ip);
    if (!parConnexion.ok) {
      throw rateLimitError(
        parConnexion,
        `Trop de demandes depuis cette connexion : réessayez ${delaiLisible(parConnexion.retryAfterSeconds)}.`,
      );
    }

    after(async () => {
      try {
        // Compté pour toute adresse saisie, qu'elle ait un compte ou non.
        // Depuis cette connexion d'abord : une fois son propre plafond
        // atteint, une machine n'entame plus celui de la boîte.
        const parAdresse = await hitRateLimitStages(
          forgotAddressStages(email, ip),
        );
        if (!parAdresse.verdict.ok) {
          // L'adresse n'est pas écrite au journal : rien ne dit qu'elle
          // appartient à qui l'a saisie.
          console.warn(
            "[forgot] demande sans suite : plafond atteint pour cette adresse.",
          );
          return;
        }

        const [user] = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user) return;

        // Le lien donne le compte à qui l'ouvre : il ne part que vers
        // l'adresse publique configurée, jamais vers celle de la requête.
        const baseUrl = secureLinkBaseUrl("Lien de réinitialisation du mot de passe");
        if (!baseUrl) return;

        const token = generateToken(32);
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + VALIDITE_MS),
        });

        const mail = passwordResetEmail({
          name: user.name,
          resetUrl: `${baseUrl}/reset/${token}`,
          identity: await getNotificationIdentity(),
        });
        await sendEmail({ to: email, ...mail });
      } catch (err) {
        console.error("[forgot] échec de l'envoi:", redactError(err));
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
