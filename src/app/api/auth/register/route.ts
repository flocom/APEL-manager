import { sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse, after } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { handleApiError, HttpError } from "@/lib/auth/guards";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  reserveAccountRequest,
  submitAccountRequest,
} from "@/lib/services/account-requests";
import { getRecaptchaRuntimeConfig } from "@/lib/services/association-settings";
import { clientIpAddress } from "@/lib/services/audit";
import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";
import { verifyRecaptcha } from "@/lib/services/recaptcha";
import { registerSchema } from "@/lib/validation";

/**
 * Création de compte.
 *
 * L'inscription reste ouverte, mais seul le tout premier compte entre d'office
 * (il devient administrateur : il n'y a encore personne pour le valider, ni
 * de messagerie configurée pour confirmer son adresse).
 *
 * Pour tous les suivants, ce formulaire ne crée qu'une *demande* : un lien part
 * à l'adresse saisie, et c'est en l'ouvrant que la personne choisit son mot de
 * passe et que le compte naît, en attente de validation. Sans cette étape,
 * n'importe qui pouvait s'inscrire au nom et à l'adresse d'un parent que le
 * bureau connaît, et se faire valider à sa place.
 *
 * La réponse est la même, que l'adresse soit nouvelle ou déjà prise, et le
 * travail qui les distingue — recherche, e-mail — se fait après elle : ni le
 * contenu ni le temps de réponse ne disent quelles adresses ont un compte.
 *
 * Seuls les plafonds de l'heure et l'absence de messagerie, qui ne regardent
 * pas l'adresse, répondent autre chose : un refus franc vaut mieux qu'un
 * « message envoyé » qui ne part pas. Comme les autres formulaires publics,
 * celui-ci passe d'abord le champ piège et, si l'association l'a activé,
 * reCAPTCHA : il fait partir un e-mail au nom de l'association vers une
 * adresse que l'auteur choisit.
 */
export async function POST(req: Request) {
  try {
    const { name, email, password, website, recaptchaToken } =
      registerSchema.parse(await req.json());

    // Robot repéré au champ caché : il lit la même réponse qu'une demande
    // transmise, et n'apprend pas qu'il a été reconnu.
    if (website && website.trim().length > 0) {
      return NextResponse.json({ ok: true, pending: true });
    }

    const ip = clientIpAddress(req);
    const recaptcha = await getRecaptchaRuntimeConfig();
    if (recaptcha) {
      await verifyRecaptcha({
        secret: recaptcha.secret,
        token: recaptchaToken,
        action: "compte",
        minScore: recaptcha.minScore,
        ip,
      });
    }

    const premierCompte = await creerPremierCompte({ name, email, password });
    if (premierCompte) {
      revalidateTag("members");
      await createSession(premierCompte.id, premierCompte.sessionEpoch);
      return NextResponse.json({ ok: true, pending: false });
    }

    // Une demande se confirme par e-mail : sans messagerie, le lien ne partirait
    // jamais, et la personne guetterait un message qui n'arrivera pas. La page
    // le dit déjà et cache le formulaire ; l'API le dit aussi, pour une page
    // restée ouverte pendant qu'on désactivait l'envoi, ou un envoi direct.
    // Ce refus ne regarde pas l'adresse saisie : il n'apprend rien sur les
    // comptes.
    if (!(await getOutboundMailRuntimeConfig())) {
      return NextResponse.json(
        {
          error:
            "Les demandes de compte se confirment par e-mail, et la messagerie de l’espace de gestion n’est pas encore configurée. Rapprochez-vous d’un membre du bureau.",
        },
        { status: 503 },
      );
    }

    const place = await reserveAccountRequest({ name, email, ip });
    if (!place.ok) {
      return NextResponse.json(
        {
          error:
            place.reason === "plafond_connexion"
              ? "Trop de demandes de compte depuis cette connexion : réessayez dans une heure."
              : "Trop de demandes de compte en ce moment : réessayez dans une heure.",
        },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }

    after(async () => {
      try {
        await submitAccountRequest({ id: place.id, email });
      } catch (erreur) {
        console.error("[inscription] demande non traitée", erreur);
      }
    });
    return NextResponse.json({ ok: true, pending: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Crée le compte administrateur si la base n'a encore aucun compte ; rend
 * `null` sinon, et le formulaire suit alors le chemin de tout le monde.
 *
 * Le premier comptage, hors transaction, évite de hacher un mot de passe et
 * de prendre un verrou à chaque demande, alors que la réponse est « non »
 * dès le deuxième compte de l'installation.
 */
async function creerPremierCompte({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password?: string;
}) {
  if ((await compterComptes(db)) > 0) return null;
  // Le formulaire d'une installation neuve demande un mot de passe ; celui
  // des suivantes non. Une page restée ouverte pendant que quelqu'un d'autre
  // créait le premier compte arrive donc ici avec un mot de passe inutile,
  // jamais l'inverse.
  if (!password) {
    throw new HttpError(400, "Choisissez un mot de passe.");
  }
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    // Verrou propre à l'inscription, relâché en fin de transaction. Sans lui,
    // deux inscriptions simultanées sur une base vide comptaient toutes deux
    // zéro compte et devenaient administrateurs ensemble.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('apel-manager:inscription'))`,
    );
    if ((await compterComptes(tx)) > 0) return null;

    const [row] = await tx
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: "admin",
        approvedAt: new Date(),
      })
      .returning({ id: users.id, sessionEpoch: users.sessionEpoch });
    return row ?? null;
  });
}

async function compterComptes(
  client: Pick<typeof db, "select">,
): Promise<number> {
  const [{ count }] = await client
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return Number(count);
}
