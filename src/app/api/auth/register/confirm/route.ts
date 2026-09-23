import { NextResponse, after } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { handleApiError, HttpError } from "@/lib/auth/guards";
import { createSession } from "@/lib/auth/session";
import {
  confirmAccountRequest,
  confirmationLinkExpired,
  findAccountRequest,
  notifyBureauOfPendingAccount,
} from "@/lib/services/account-requests";
import { accountConfirmSchema } from "@/lib/validation";

/**
 * Confirmation d'une demande de compte, depuis le lien reçu par e-mail.
 *
 * Un POST, jamais le simple fait d'ouvrir le lien : les messageries
 * d'entreprise et les antivirus visitent les liens des e-mails reçus. Une
 * confirmation au premier GET aurait donc été faite par le robot de la boîte
 * visée — exactement ce que la demande de compte au nom d'un autre espère.
 *
 * Le compte naît ici, en attente de validation, avec le nom relu et le mot de
 * passe choisi par la personne. Une session s'ouvre : elle mène à la page
 * d'attente, la seule qu'un compte en attente puisse voir.
 */
export async function POST(req: Request) {
  try {
    const { token, name, password } = accountConfirmSchema.parse(
      await req.json(),
    );

    // Le lien d'abord, le mot de passe ensuite. Hacher coûte près de cent
    // millisecondes de calcul : le faire avant de savoir si le lien vaut
    // quelque chose offrait ce prix à n'importe quel envoi, jeton inventé
    // compris. La transaction de `confirmAccountRequest` revérifie le lien
    // sous verrou : deux clics simultanés passent tous deux ce premier
    // contrôle, un seul crée le compte.
    if (!(await findAccountRequest(token))) {
      throw confirmationLinkExpired();
    }

    const compte = await confirmAccountRequest({
      token,
      name,
      passwordHash: await hashPassword(password),
    });
    if (!compte) {
      throw new HttpError(
        409,
        "Cette adresse a déjà un compte : connectez-vous, ou choisissez un nouveau mot de passe depuis « Mot de passe oublié ».",
      );
    }

    await createSession(compte.id, compte.sessionEpoch);
    after(() => notifyBureauOfPendingAccount(compte));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
