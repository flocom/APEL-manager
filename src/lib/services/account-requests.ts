import "server-only";

import { and, eq, gt, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { getBaseUrl, secureLinkBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import {
  accountRequestDrops,
  accountRequests,
  users,
  type AccountRequestDropReason,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import {
  ACCOUNT_REQUEST_DROP_REASONS,
  type DroppedAccountRequests,
} from "@/lib/labels";
import { sendEmail } from "@/lib/notifications/email";
import {
  accountRequestEmail,
  existingAccountEmail,
  pendingAccountNoticeEmail,
  pendingAccountsReminderEmail,
} from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { generateToken, hashToken } from "@/lib/tokens";

import { getAssociationSettings } from "./association-settings";
import type { OutboundMailRuntimeConfig } from "./mail-settings";
import { countPendingAccounts } from "./user-accounts";
import { emailKey, hitRateLimit, PLAFONDS } from "./rate-limit";

/**
 * Les demandes de compte, de l'envoi du formulaire à la confirmation de
 * l'adresse.
 *
 * Tant que l'adresse n'est pas confirmée, il n'y a pas de compte : ni ligne
 * dans `users`, ni mot de passe. C'est ce qui ferme deux portes à la fois.
 * Une demande déposée au nom et à l'adresse d'un parent connu n'arrive jamais
 * devant un administrateur si ce parent ne la confirme pas. Et le formulaire
 * ne dit plus, même indirectement, quelles adresses ont un compte : sans mot
 * de passe choisi à la demande, une tentative de connexion juste après
 * échoue de la même façon pour une adresse nouvelle et pour une adresse prise.
 */

/** Validité du lien de confirmation : le temps de relever une boîte peu lue. */
export const ACCOUNT_REQUEST_VALIDITY_DAYS = 3;

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;

// Plafonds. Chaque demande fait partir un e-mail, depuis l'adresse de
// l'association, vers une adresse que n'importe qui choisit : sans limite, le
// formulaire servirait à inonder une boîte, et la réputation d'envoi de
// l'association en paierait le prix. Une association de parents reçoit
// quelques demandes par semaine, au plus quelques-unes par heure à la rentrée :
// ces seuils ne gênent qu'un abus.
//
// Les deux plafonds de l'heure ne dépendent pas de l'adresse saisie : ils se
// vérifient avant la réponse, et le refus se dit (« réessayez dans une
// heure ») sans rien apprendre à personne. Taire ce refus fermait le
// formulaire à tout le monde : vingt envois anonymes suffisaient, et le parent
// suivant lisait qu'un message lui était parti.

/**
 * Toutes connexions confondues : le dernier rempart pour la réputation d'envoi,
 * contre un abus réparti sur beaucoup d'adresses IP. Le plafond par connexion
 * arrête l'abus ordinaire bien avant ; celui-ci peut donc rester large.
 */
const MAX_PAR_HEURE = 50;
/**
 * Depuis une même connexion. Assez pour un bureau qui crée ses comptes
 * ensemble sur le wifi de l'école, au sortir d'une assemblée générale ; pas
 * assez pour qu'une seule machine épuise à elle seule le plafond général.
 */
const MAX_PAR_IP_PAR_HEURE = 10;
/**
 * Demandes pour une même adresse en 24 h. Celui-ci dépend de l'adresse : son
 * refus reste muet, sans quoi la réponse dirait qu'elle a déjà servi. Qui
 * l'atteint a de toute façon déjà reçu trois messages dans la journée.
 */
const MAX_PAR_ADRESSE_PAR_JOUR = 3;
/** Au-delà, les nouvelles demandes attendent que le bureau ait fait le tri. */
const MAX_COMPTES_EN_ATTENTE = 50;

/**
 * Le formulaire de demande est-il fermé ? Exposé pour que le récapitulatif
 * quotidien, qui remplace le rappel en mode « quotidien », le dise aussi :
 * sans quoi, dans le mode par défaut, personne n'apprendrait que les parents
 * qui demandent un compte n'obtiennent plus rien.
 */
export function accountRequestFormClosed(enAttente: number): boolean {
  return enAttente >= MAX_COMPTES_EN_ATTENTE;
}
/** Au-delà, l'avis immédiat au bureau se tait ; le compteur et le bandeau restent. */
const MAX_AVIS_IMMEDIATS_PAR_HEURE = 5;

/** Les compteurs de refus de plus d'un mois n'apprennent plus rien. */
const CONSERVATION_REFUS_JOURS = 30;

type Client = Pick<typeof db, "insert">;

/**
 * Compte une demande écartée par un plafond, dans la case de l'heure en cours.
 *
 * Aucune adresse ni aucune IP n'est gardée : il s'agit de dire au bureau que
 * le formulaire refuse du monde, pas de désigner qui.
 */
async function noterRefus(
  reason: AccountRequestDropReason,
  client: Client = db,
) {
  await client
    .insert(accountRequestDrops)
    .values({ hour: sql`date_trunc('hour', now())`, reason, count: 1 })
    .onConflictDoUpdate({
      target: [accountRequestDrops.hour, accountRequestDrops.reason],
      set: { count: sql`${accountRequestDrops.count} + 1` },
    });
}

export type AccountRequestReservation =
  | { ok: true; id: string }
  | { ok: false; reason: "plafond_general" | "plafond_connexion" };

/**
 * Réserve la place d'une demande sous les plafonds de l'heure, avant que la
 * réponse ne parte.
 *
 * La ligne est écrite ici, et pas plus tard dans `after()` : sinon, cent
 * envois simultanés comptaient tous zéro demande et passaient tous. Le verrou
 * rend le comptage et l'écriture indivisibles. Le travail est le même quelle
 * que soit l'adresse — rien ici ne la regarde — et ne trahit donc rien par
 * son temps de réponse.
 */
export async function reserveAccountRequest({
  name,
  email,
  ip,
}: {
  name: string;
  email: string;
  ip: string | null;
}): Promise<AccountRequestReservation> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('apel-manager:demandes-de-compte'))`,
    );
    const depuis = new Date(Date.now() - HEURE);
    const [[auTotal], parConnexion] = await Promise.all([
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(accountRequests)
        .where(gt(accountRequests.createdAt, depuis)),
      // Sans adresse IP connue (pas de reverse proxy devant l'application),
      // toutes les demandes partageraient la même case : le plafond par
      // connexion deviendrait un second plafond général, bien plus bas.
      ip
        ? tx
            .select({ n: sql<number>`count(*)::int` })
            .from(accountRequests)
            .where(
              and(
                eq(accountRequests.ipAddress, ip),
                gt(accountRequests.createdAt, depuis),
              ),
            )
        : Promise.resolve([{ n: 0 }]),
    ]);

    // Le plafond par connexion d'abord : c'est lui qui arrête un abus ordinaire,
    // et son refus ne coûte rien aux autres visiteurs.
    if (Number(parConnexion[0]?.n ?? 0) >= MAX_PAR_IP_PAR_HEURE) {
      await noterRefus("plafond_connexion", tx);
      return { ok: false, reason: "plafond_connexion" };
    }
    if (Number(auTotal.n) >= MAX_PAR_HEURE) {
      await noterRefus("plafond_general", tx);
      console.warn(
        `[inscription] demande refusée : ${auTotal.n} demandes depuis une heure, toutes connexions confondues.`,
      );
      return { ok: false, reason: "plafond_general" };
    }

    const [ligne] = await tx
      .insert(accountRequests)
      .values({
        email,
        name,
        ipAddress: ip,
        tokenHash: null,
        expiresAt: new Date(Date.now() + ACCOUNT_REQUEST_VALIDITY_DAYS * JOUR),
      })
      .returning({ id: accountRequests.id });
    return { ok: true, id: ligne.id };
  });
}

/**
 * Traite une demande réservée, une fois la réponse partie.
 *
 * Appelée depuis `after()` : la réponse HTTP est la même, et arrive au même
 * moment, que l'adresse soit nouvelle, déjà prise ou au-delà de son plafond.
 * Tout ce qui les distingue se passe ici, hors de portée de qui chronomètre.
 */
export async function submitAccountRequest({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const now = Date.now();
  const [[parAdresse], [compte]] = await Promise.all([
    // Les demandes précédentes pour cette adresse, pas celle-ci : elle est
    // déjà écrite, et se compter elle-même avancerait le plafond d'un cran.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accountRequests)
      .where(
        and(
          eq(accountRequests.email, email),
          ne(accountRequests.id, id),
          gt(accountRequests.createdAt, new Date(now - JOUR)),
        ),
      ),
    db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1),
  ]);

  // Le compte par adresse exacte ne voyait pas « parent+1@… », « parent+2@… »
  // ni les points d'une adresse Gmail : autant d'adresses différentes pour la
  // même boîte, qui recevait donc autant de messages. Le limiteur partagé
  // compte la boîte elle-même (adresse normalisée par `emailKey`).
  const parBoite = await hitRateLimit(
    PLAFONDS.demandeCompteBoiteJour,
    emailKey(email),
  );

  // L'adresse n'est pas écrite au journal : rien ne dit qu'elle appartient à
  // qui l'a saisie.
  if (Number(parAdresse.n) >= MAX_PAR_ADRESSE_PAR_JOUR || !parBoite.ok) {
    await noterRefus("plafond_adresse");
    console.warn(
      `[inscription] demande sans suite : plafond de ${MAX_PAR_ADRESSE_PAR_JOUR} demandes par adresse en 24 h atteint.`,
    );
    return;
  }

  const [association, baseUrl] = await Promise.all([
    getAssociationSettings(),
    getBaseUrl(),
  ]);

  if (compte) {
    // La ligne réservée reste sans jeton : elle ne confirme rien, elle compte
    // l'envoi.
    const parti = await sendEmail({
      to: email,
      ...existingAccountEmail({
        name: compte.name,
        loginUrl: `${baseUrl}/login`,
        forgotUrl: `${baseUrl}/forgot`,
        identity: await getNotificationIdentity(association),
      }),
    });
    if (!parti) {
      console.warn("[inscription] rappel « compte existant » non remis.");
    }
    return;
  }

  const enAttente = await countPendingAccounts();
  if (enAttente >= MAX_COMPTES_EN_ATTENTE) {
    await noterRefus("comptes_en_attente");
    console.warn(
      `[inscription] demande sans suite : ${enAttente} comptes attendent déjà une décision.`,
    );
    return;
  }

  // Le lien porte le jeton qui fait naître le compte : il ne part que vers
  // l'adresse publique configurée (lib/base-url.ts). La route refuse déjà la
  // demande quand elle manque ; ce contrôle couvre la configuration changée
  // entre-temps.
  const baseDesLiens = secureLinkBaseUrl("Lien de confirmation de compte");
  if (!baseDesLiens) return;

  const token = generateToken(32);
  await db
    .update(accountRequests)
    .set({ tokenHash: hashToken(token) })
    .where(eq(accountRequests.id, id));
  const parti = await sendEmail({
    to: email,
    ...accountRequestEmail({
      confirmUrl: `${baseDesLiens}/register/${token}`,
      validiteJours: ACCOUNT_REQUEST_VALIDITY_DAYS,
      identity: await getNotificationIdentity(association),
    }),
  });
  if (!parti) {
    console.warn("[inscription] lien de confirmation non remis.");
  }
}

/**
 * Demandes de compte écartées par un plafond entre deux instants, par motif.
 *
 * Par motif, et non en un seul total : les quatre ne disent pas la même chose
 * au bureau. Un robot arrêté par le plafond d'une connexion ne demande rien ;
 * un formulaire fermé parce que cinquante comptes attendent une décision
 * demande, lui, qu'un administrateur fasse le tri.
 *
 * Le compteur est tenu par heure : la fenêtre est ramenée à des heures
 * entières, de l'heure de `depuis` incluse à celle de `jusqua` exclue. Deux
 * fenêtres qui se suivent ne comptent ainsi jamais deux fois la même heure,
 * et n'en oublient aucune ; l'heure en cours attend simplement le passage
 * suivant.
 */
export async function countDroppedAccountRequests({
  depuis,
  jusqua,
}: {
  depuis: Date;
  jusqua?: Date;
}): Promise<DroppedAccountRequests> {
  const lignes = await db
    .select({
      reason: accountRequestDrops.reason,
      n: sql<number>`coalesce(sum(${accountRequestDrops.count}), 0)::int`,
    })
    .from(accountRequestDrops)
    .where(
      and(
        gte(
          accountRequestDrops.hour,
          sql`date_trunc('hour', ${depuis.toISOString()}::timestamptz)`,
        ),
        jusqua
          ? lt(
              accountRequestDrops.hour,
              sql`date_trunc('hour', ${jusqua.toISOString()}::timestamptz)`,
            )
          : undefined,
      ),
    )
    .groupBy(accountRequestDrops.reason);

  const parMotif = Object.fromEntries(
    ACCOUNT_REQUEST_DROP_REASONS.map((motif) => [motif, 0]),
  ) as DroppedAccountRequests;
  for (const { reason, n } of lignes) {
    // Un motif inconnu (colonne en texte libre, version plus récente passée
    // par là) ne doit ni planter l'écran ni gonfler un autre motif.
    if (reason in parMotif) parMotif[reason] += Number(n);
  }
  return parMotif;
}

/**
 * Le refus d'un lien de confirmation, qu'il soit inconnu, déjà servi ou
 * expiré. Un seul message pour les trois : la route le donne avant de hacher
 * le mot de passe, la transaction après, et la personne lit la même chose.
 */
export function confirmationLinkExpired() {
  return new HttpError(
    400,
    "Ce lien n’est plus valable : il a déjà servi, ou il a expiré. Refaites une demande de compte.",
  );
}

/** La demande qu'ouvre un lien de confirmation, si elle vaut encore. */
export async function findAccountRequest(token: string) {
  if (token.length < 16 || token.length > 200) return null;
  const [demande] = await db
    .select({ email: accountRequests.email, name: accountRequests.name })
    .from(accountRequests)
    .where(
      and(
        eq(accountRequests.tokenHash, hashToken(token)),
        isNull(accountRequests.usedAt),
        gt(accountRequests.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return demande ?? null;
}

/**
 * Confirme une demande : le compte naît, en attente de validation.
 *
 * Rend `null` quand l'adresse a déjà un compte — créé entre-temps, ou par une
 * autre demande confirmée avant celle-ci. Le dire n'apprend rien à personne :
 * seul le titulaire de la boîte a pu ouvrir ce lien.
 */
export async function confirmAccountRequest({
  token,
  name,
  passwordHash,
}: {
  token: string;
  name: string;
  passwordHash: string;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    // Verrou sur la ligne : deux clics sur le même lien ne créent qu'un compte.
    const [demande] = await tx
      .select({ id: accountRequests.id, email: accountRequests.email })
      .from(accountRequests)
      .where(
        and(
          eq(accountRequests.tokenHash, hashToken(token)),
          isNull(accountRequests.usedAt),
          gt(accountRequests.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");
    if (!demande) throw confirmationLinkExpired();

    // Toutes les demandes encore ouvertes pour cette adresse tombent avec
    // celle-ci. Un lien plus ancien, peut-être déposé par quelqu'un d'autre,
    // ne doit pas pouvoir servir après coup.
    await tx
      .update(accountRequests)
      .set({ usedAt: now })
      .where(
        and(
          eq(accountRequests.email, demande.email),
          isNull(accountRequests.usedAt),
        ),
      );

    const [cree] = await tx
      .insert(users)
      .values({
        name,
        email: demande.email,
        passwordHash,
        role: "member",
        approvedAt: null,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        sessionEpoch: users.sessionEpoch,
      });
    return cree ?? null;
  });
}

/**
 * Avis immédiat au bureau, si l'association a choisi ce mode. Dans tous les
 * modes, le cron quotidien rappelle ensuite les comptes en attente chaque jour
 * jusqu'à ce qu'ils soient traités (`remindBureauOfPendingAccounts`, ou le
 * récapitulatif en mode « quotidien ») : cet avis-ci n'est qu'une avance.
 *
 * Il part à la confirmation de l'adresse, pas à la demande : une demande que
 * personne ne confirme n'a rien à faire dans la boîte du bureau.
 */
export async function notifyBureauOfPendingAccount(compte: {
  name: string;
  email: string;
}) {
  try {
    const [association, baseUrl] = await Promise.all([
      getAssociationSettings(),
      getBaseUrl(),
    ]);
    if (association.signupNoticeMode !== "immediat") return;
    const destinataire = association.contactEmail?.trim();
    if (!destinataire) return;

    const [[recents], enAttente] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            isNull(users.approvedAt),
            gt(users.createdAt, new Date(Date.now() - HEURE)),
          ),
        ),
      countPendingAccounts(),
    ]);
    // Un afflux de comptes ne doit pas devenir un afflux de messages dans la
    // boîte partagée du bureau. Chaque avis donne le total en attente : le
    // prochain rattrapera ceux-ci, et d'ici là le menu et le tableau de bord
    // les signalent.
    if (Number(recents.n) > MAX_AVIS_IMMEDIATS_PAR_HEURE) {
      console.warn(
        `[inscription] avis au bureau suspendu : ${recents.n} comptes en attente créés depuis une heure.`,
      );
      return;
    }

    // `sendEmail` rend `false` au lieu de lever : sans ce contrôle, le bureau
    // cesserait d'être prévenu sans que rien ne le signale.
    const parti = await sendEmail({
      to: destinataire,
      ...pendingAccountNoticeEmail({
        name: compte.name,
        email: compte.email,
        enAttente,
        reviewUrl: `${baseUrl}/dashboard/members`,
        identity: await getNotificationIdentity(association),
      }),
    });
    if (!parti) {
      console.warn(
        "[inscription] avis au bureau non remis à l’adresse de contact.",
      );
    }
  } catch (erreur) {
    console.error("[inscription] avis au bureau non envoyé", redactError(erreur));
  }
}

/** Le rappel prêt à partir : ce qu'il dira, et à qui. */
export type PendingAccountsReminder = {
  comptesEnAttente: number;
  destinataires: string[];
  /** `null` : personne n'attend, ou personne à prévenir. */
  mail: ReturnType<typeof pendingAccountsReminderEmail> | null;
};

/**
 * Le rappel quotidien des comptes en attente de validation, quel que soit le
 * mode d'avis choisi.
 *
 * Le réglage des avis d'inscription dit combien de nouvelles le bureau veut
 * recevoir ; il ne peut pas vouloir dire « laisser quelqu'un à la porte sans
 * que personne le sache ». En mode « aucun », rien d'autre ne l'aurait dit hors
 * de l'application ; en mode « immédiat », les avis se taisent au-delà de
 * quelques comptes par heure. Le cron n'appelle donc cette fonction que si le
 * récapitulatif n'a pas déjà porté les comptes en attente : jamais deux
 * messages pour la même nouvelle.
 *
 * L'adresse de contact d'abord, comme les autres avis au bureau. Sans elle,
 * les administrateurs, chacun dans sa boîte : ce sont eux, et eux seuls, qui
 * peuvent valider — et sans ce repli, une association sans adresse de contact
 * n'apprendrait jamais qu'un compte attend.
 *
 * En deux temps — préparer, qui lit la base, puis envoyer, qui n'y touche
 * plus — parce que le cron envoie sous le verrou d'une transaction, où une
 * lecture par `db` attendrait sans fin la seule connexion du pool sur Vercel.
 */
export async function preparePendingAccountsReminder(): Promise<PendingAccountsReminder> {
  const enAttente = await countPendingAccounts();
  if (enAttente === 0) {
    return { comptesEnAttente: 0, destinataires: [], mail: null };
  }

  const [association, baseUrl] = await Promise.all([
    getAssociationSettings(),
    getBaseUrl(),
  ]);
  const contact = association.contactEmail?.trim();
  const destinataires = contact
    ? [contact]
    : (
        await db
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.role, "admin"), isNotNull(users.approvedAt)))
      ).map((u) => u.email);
  if (destinataires.length === 0) {
    return { comptesEnAttente: enAttente, destinataires: [], mail: null };
  }

  const mail = pendingAccountsReminderEmail({
    enAttente,
    formulaireFerme: accountRequestFormClosed(enAttente),
    reviewUrl: `${baseUrl}/dashboard/members`,
    identity: await getNotificationIdentity(association),
  });
  return { comptesEnAttente: enAttente, destinataires, mail };
}

/** Envoie le rappel préparé, par le transport lu d'avance : sans base. */
export async function remindBureauOfPendingAccounts(
  rappel: PendingAccountsReminder,
  transport: OutboundMailRuntimeConfig | null,
): Promise<{
  comptesEnAttente: number;
  envoye: boolean;
  destinataires: number;
}> {
  const { mail, destinataires } = rappel;
  if (!mail || destinataires.length === 0) {
    return {
      comptesEnAttente: rappel.comptesEnAttente,
      envoye: false,
      destinataires: 0,
    };
  }
  // Un message par administrateur, jamais un seul à plusieurs : chacun n'a pas
  // à lire l'adresse personnelle des autres.
  const partis = await Promise.all(
    destinataires.map((to) => sendEmail({ to, ...mail, transport })),
  );
  const remis = partis.filter(Boolean).length;
  if (remis < destinataires.length) {
    console.warn(
      `[inscription] rappel des comptes en attente remis à ${remis} destinataire(s) sur ${destinataires.length}.`,
    );
  }
  return {
    comptesEnAttente: rappel.comptesEnAttente,
    envoye: remis > 0,
    destinataires: remis,
  };
}

/**
 * Efface les demandes expirées, confirmées ou non. Appelée par le cron
 * quotidien : une demande jamais confirmée garde le nom et l'adresse de
 * quelqu'un qui n'a peut-être rien demandé, et n'a aucune raison de rester.
 * Les compteurs de refus trop anciens partent avec elles.
 */
export async function purgeExpiredAccountRequests(): Promise<number> {
  const [effacees] = await Promise.all([
    db
      .delete(accountRequests)
      .where(lt(accountRequests.expiresAt, new Date()))
      .returning({ id: accountRequests.id }),
    db
      .delete(accountRequestDrops)
      .where(
        lt(
          accountRequestDrops.hour,
          new Date(Date.now() - CONSERVATION_REFUS_JOURS * JOUR),
        ),
      ),
  ]);
  return effacees.length;
}
