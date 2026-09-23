import { timingSafeEqual } from "node:crypto";

import { and, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { formatDateTime, formatDuree, startOfLocalDay } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  associationSettings,
  auditLogs,
  events,
  meetingAttendance,
  notificationsLog,
  passwordResetTokens,
  revokedSessions,
  tasks,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { notifyTaskDue, type NotifyKind } from "@/lib/notifications";
import { sendEmail } from "@/lib/notifications/email";
import {
  dailyDigestEmail,
  volunteerReminderEmail,
  type NotificationIdentity,
} from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import {
  getAssociationSettings,
  getTelegramBotToken,
} from "@/lib/services/association-settings";
import { configuredBaseUrl, getBaseUrl } from "@/lib/base-url";
import { totalDroppedAccountRequests } from "@/lib/labels";
import {
  accountRequestFormClosed,
  countDroppedAccountRequests,
  preparePendingAccountsReminder,
  purgeExpiredAccountRequests,
  remindBureauOfPendingAccounts,
} from "@/lib/services/account-requests";
import { purgeOAuthGarbage } from "@/lib/mcp/oauth";
import { purgeExpiredRateLimits } from "@/lib/services/rate-limit";
import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";
import { collectReferencedUploadIds } from "@/lib/services/uploads-references";
import { countPendingAccounts } from "@/lib/services/user-accounts";
import { cleanupOrphanedUploads } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** L'action du journal qui atteste qu'un rappel des comptes en attente est parti. */
const RAPPEL_COMPTES_EN_ATTENTE = "account.pending_reminder";

/**
 * Une tâche, dans l'onglet « préparation » de son événement — celui qui porte
 * la check-list —, ancre comprise : le lien tombe sur la tâche elle-même, pas
 * sur une liste où il faudrait la chercher.
 */
function urlTache(
  baseUrl: string,
  task: { id: string; event: { id: string } },
): string {
  return `${baseUrl}/dashboard/events/${task.event.id}/preparation#tache-${task.id}`;
}

/**
 * Déclenché par le Cron Vercel (voir vercel.json). Parcourt les tâches non
 * terminées dont l'échéance approche ou est dépassée et notifie les membres
 * assignés. Un journal évite les doublons (un rappel + un retard par tâche/membre).
 */
export async function GET(req: Request) {
  // Fail-closed : sans secret configuré, l'endpoint refuse de s'exécuter.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET n'est pas configuré sur le serveur." },
      { status: 500 },
    );
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [association, telegramBotToken, baseUrl] = await Promise.all([
    getAssociationSettings(),
    getTelegramBotToken(),
    // Une seule base pour tous les liens du passage — rappels, récapitulatif :
    // un même message ne peut pas mêler lien absolu et lien relatif.
    getBaseUrl(),
  ]);

  const now = new Date();
  const notificationIdentity = await getNotificationIdentity(association);
  const horizon = new Date(
    now.getTime() +
      association.taskReminderWindowDays * 24 * 60 * 60 * 1000,
  );

  const dueTasksBrutes = await db.query.tasks.findMany({
    where: and(ne(tasks.status, "done"), lte(tasks.dueAt, horizon)),
    with: {
      event: true,
      assignees: { with: { user: true } },
    },
  });
  /**
   * Les tâches d'un événement annulé sortent de tout : ni rappel individuel,
   * ni ligne dans le récapitulatif. Relancer quelqu'un sur la préparation
   * d'une fête décommandée use la confiance qu'on met dans ces messages —
   * après deux rappels inutiles, on ne les lit plus.
   *
   * Le filtre est posé ici, une fois, plutôt que dans chacun des deux usages :
   * un troisième arriverait un jour et hériterait de l'oubli.
   */
  const dueTasks = dueTasksBrutes.filter(
    (t) => t.event.cancelledAt === null,
  );
  const tachesAnnulees = dueTasksBrutes.length - dueTasks.length;

  // 1) Construire la liste des notifications candidates (tâche × membre).
  type Candidate = {
    task: (typeof dueTasks)[number];
    user: NonNullable<(typeof dueTasks)[number]["assignees"][number]["user"]>;
    kind: NotifyKind;
  };
  const candidates: Candidate[] = [];
  for (const task of dueTasks) {
    const kind: NotifyKind = task.dueAt < now ? "overdue" : "reminder";
    for (const { user } of task.assignees) {
      if (user) candidates.push({ task, user, kind });
    }
  }

  // 2) Réserver chaque rappel AVANT de l'envoyer : la ligne du journal est
  //    posée d'abord, et seuls partent ceux que cette insertion a réellement
  //    créés. Lire le journal puis écrire après l'envoi laissait deux passages
  //    simultanés du cron (planificateur relancé, appel manuel pendant le
  //    passage planifié) lire tous deux « pas encore envoyé » et relancer deux
  //    fois la même personne. L'index unique (tâche, membre, type) tranche :
  //    une seule insertion gagne.
  const reserves = candidates.length
    ? await db
        .insert(notificationsLog)
        .values(
          candidates.map((c) => ({
            taskId: c.task.id,
            userId: c.user.id,
            kind: c.kind,
          })),
        )
        .onConflictDoNothing()
        .returning({
          taskId: notificationsLog.taskId,
          userId: notificationsLog.userId,
          kind: notificationsLog.kind,
        })
    : [];
  const reservesCles = new Set(
    reserves.map((r) => `${r.taskId}:${r.userId}:${r.kind}`),
  );
  const todo = candidates.filter((c) =>
    reservesCles.has(`${c.task.id}:${c.user.id}:${c.kind}`),
  );
  const skipped = candidates.length - todo.length;

  // 3) Envoyer tous les rappels réservés en parallèle.
  const results = await Promise.all(
    todo.map(async (c) => {
      const ok = await notifyTaskDue({
        user: {
          name: c.user.name,
          email: c.user.email,
          telegramChatId: c.user.telegramChatId,
        },
        taskTitle: c.task.title,
        eventTitle: c.task.event.title,
        dueAt: c.task.dueAt,
        kind: c.kind,
        taskUrl: urlTache(baseUrl, c.task),
        identity: notificationIdentity,
        telegramBotToken,
      });
      return { c, ok };
    }),
  );

  // 4) Rendre la réservation des échecs : ils seront réessayés au prochain
  //    passage, comme avant.
  const echecs = results.filter((r) => !r.ok).map((r) => r.c);
  for (const c of echecs) {
    await db
      .delete(notificationsLog)
      .where(
        and(
          eq(notificationsLog.taskId, c.task.id),
          eq(notificationsLog.userId, c.user.id),
          eq(notificationsLog.kind, c.kind),
        ),
      );
  }
  const succeeded = results.filter((r) => r.ok).map((r) => r.c);

  // --- Rappels aux bénévoles : événement publié dans la fenêtre configurée,
  //     e-mail fourni, pas encore rappelé. -------------------------------------
  const volunteerHorizon = new Date(
    now.getTime() +
      association.volunteerReminderWindowDays * 24 * 60 * 60 * 1000,
  );
  // Sans URL publique configurée, les liens des e-mails seraient cassés : on saute.
  // On charge aussi les inscrits SANS e-mail, uniquement pour les compter :
  // l'adresse est désormais exigée à l'inscription, mais les inscriptions
  // antérieures à cette règle n'en ont pas toujours. Sans ce décompte, le
  // rappel les sautait en silence, et le réglage « prévenir les inscrits »
  // promettait ce qu'il ne tenait pas.
  const signups = configuredBaseUrl()
    ? await db.query.volunteerSignups.findMany({
        where: isNull(volunteerSignups.remindedAt),
        with: { slot: { with: { event: true } } },
      })
    : [];

  const dansLaFenetre = signups.filter((s) => {
    const ev = s.slot.event;
    return (
      ev.status === "published" &&
      // Un événement annulé ne se rappelle pas : le seul message qui lui reste
      // à envoyer est celui de l'annulation, déjà parti.
      ev.cancelledAt === null &&
      ev.startAt > now &&
      ev.startAt <= volunteerHorizon
    );
  });
  const eligibleSignups = dansLaFenetre.filter((s) => !!s.email);
  const volunteersSansEmail = dansLaFenetre.length - eligibleSignups.length;

  // Réserver avant d'envoyer, comme pour les tâches : le témoin `reminded_at`
  // est posé d'abord, et seules partent les inscriptions que CE passage a
  // réservées. Deux passages simultanés du cron lisaient sinon tous deux
  // « pas encore rappelé » et envoyaient chacun le rappel.
  const idsEligibles = eligibleSignups.map((s) => s.id);
  const reservees = idsEligibles.length
    ? await db
        .update(volunteerSignups)
        .set({ remindedAt: new Date() })
        .where(
          and(
            inArray(volunteerSignups.id, idsEligibles),
            isNull(volunteerSignups.remindedAt),
          ),
        )
        .returning({ id: volunteerSignups.id })
    : [];
  const idsReserves = new Set(reservees.map((r) => r.id));

  const envois = await Promise.all(
    eligibleSignups
      .filter((s) => idsReserves.has(s.id))
      .map(async (s) => {
        const ev = s.slot.event;
        const mail = volunteerReminderEmail({
          name: s.name,
          eventTitle: ev.title,
          eventDate: formatDateTime(ev.startAt),
          slotTitle: s.slot.title,
          location: ev.location,
          cancelUrl: s.cancelToken
            ? `${baseUrl}/annulation/${s.cancelToken}`
            : baseUrl,
          identity: notificationIdentity,
        });
        const ok = await sendEmail({ to: s.email as string, ...mail });
        return { id: s.id, ok };
      }),
  );
  const remindedIds = envois.filter((e) => e.ok).map((e) => e.id);
  // Un envoi manqué rend sa réservation : le passage suivant le réessaiera.
  const nonRemis = envois.filter((e) => !e.ok).map((e) => e.id);
  if (nonRemis.length > 0) {
    await db
      .update(volunteerSignups)
      .set({ remindedAt: null })
      .where(inArray(volunteerSignups.id, nonRemis));
  }
  const volunteerReminders = remindedIds.length;
  if (volunteersSansEmail > 0) {
    console.warn(
      `[cron] ${volunteersSansEmail} bénévole(s) à rappeler n'ont pas d'adresse e-mail : aucun rappel ne peut leur être envoyé.`,
    );
  }

  // --- Récapitulatif quotidien adressé au bureau ------------------------------
  // `dueTasks` est réutilisé tel quel : c'est exactement la même sélection
  // (non terminées, échéance dans la fenêtre de rappel) que celle qui vient de
  // servir aux rappels individuels. Une seconde requête dirait la même chose.
  const digest = await envoyerRecapitulatif(
    association,
    notificationIdentity,
    baseUrl,
    now,
    dueTasks,
  );

  // --- Comptes en attente de validation, quel que soit le mode d'avis --------
  // Le récapitulatif les porte déjà quand il part : un second message ne dirait
  // rien de plus. Sinon — mode « immédiat » ou « aucun », pas d'adresse de
  // contact, envoi manqué, rien à dire — un rappel à part s'en charge. Une
  // personne bloquée à l'entrée ne doit pas dépendre du réglage des avis
  // d'inscription. Un récapitulatif parti plus tôt dans la journée ne compte
  // que s'il annonçait, lui, des comptes en attente : son témoin garde le
  // nombre. Un récapitulatif qui n'avait rien à dire n'est pas parti, et
  // n'a rien annoncé.
  const comptesAnnonces =
    digest.envoye || digest.dejaEnvoyeAujourdhui ? digest.comptesEnAttente : 0;
  const rappelComptesEnAttente =
    comptesAnnonces > 0
      ? {
          dansLeRecapitulatif: true,
          comptesEnAttente: comptesAnnonces,
          ...(digest.dejaEnvoyeAujourdhui
            ? { dejaEnvoyeAujourdhui: true }
            : {}),
        }
      : { dansLeRecapitulatif: false, ...(await rappelerComptesEnAttente(now)) };

  let orphanedUploadsRemoved = 0;
  try {
    // Une erreur ici abandonne le nettoyage : mieux vaut garder des fichiers
    // inutiles que d'en supprimer un qui servait encore.
    orphanedUploadsRemoved = await cleanupOrphanedUploads(
      await collectReferencedUploadIds(),
    );
  } catch (error) {
    console.error(
      "[uploads] nettoyage des fichiers orphelins impossible :",
      redactError(error),
    );
  }

  // Les demandes de compte jamais confirmées gardent le nom et l'adresse de
  // quelqu'un qui n'a peut-être rien demandé : elles partent à expiration.
  let demandesDeCompteEffacees = 0;
  try {
    demandesDeCompteEffacees = await purgeExpiredAccountRequests();
  } catch (error) {
    console.error(
      "[cron] purge des demandes de compte expirées impossible :",
      redactError(error),
    );
  }

  const menage = await menageDeSecurite();

  return NextResponse.json({
    ok: true,
    menage,
    checkedTasks: dueTasks.length,
    /** Tâches écartées parce que leur événement est annulé. */
    tachesEvenementsAnnules: tachesAnnulees,
    sent: succeeded.length,
    skipped,
    failed: results.length - succeeded.length,
    volunteerReminders,
    /** Inscrits que le rappel ne peut pas atteindre, faute d'adresse. */
    volunteersSansEmail,
    recapQuotidien: digest,
    rappelComptesEnAttente,
    orphanedUploadsRemoved,
    demandesDeCompteEffacees,
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Lecteur = Pick<typeof db, "select">;

/**
 * Les deux messages quotidiens au bureau — le récapitulatif, le rappel des
 * comptes en attente — partent au plus une fois par jour, même si le cron est
 * rejoué ou lancé deux fois en parallèle, et une panne ne les perd pas.
 *
 * Le schéma est le même pour les deux : un verrou consultatif pris dans une
 * transaction met les appels en file ; sous ce verrou, le témoin du jour est
 * cherché au journal, le message part, puis le témoin s'écrit, dans la même
 * transaction. Un second appel attend, trouve le témoin, et s'arrête. Un
 * passage coupé avant la fin — délai dépassé, redéploiement, processus tué —
 * n'a rien validé : la transaction est annulée, et le passage suivant
 * réessaie. Au pire, un message parti juste avant la coupure repart : un
 * doublon, plutôt qu'une journée perdue.
 *
 * Rien, dans ces transactions, ne passe par `db` : sur Vercel le pool n'a
 * qu'une connexion, celle que la transaction occupe, et une lecture par `db`
 * l'attendrait sans fin — le cron resterait bloqué jusqu'à son délai, sans
 * nettoyer ni purger. Tout ce qui se lit (messages, destinataires, transport
 * d'envoi) est donc préparé AVANT, et relu sous le verrou seulement pour ce
 * qui décide : le témoin, la fenêtre.
 */
async function verrouQuotidien(tx: Transaction, cle: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${cle}))`);
}

/** Le témoin d'un message quotidien parti aujourd'hui (jour de Paris). */
async function temoinDuJour(lecteur: Lecteur, action: string, now: Date) {
  const [temoin] = await lecteur
    .select({ details: auditLogs.details })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, action),
        gte(auditLogs.createdAt, startOfLocalDay(now)),
      ),
    )
    .limit(1);
  return temoin ?? null;
}

/**
 * Le ménage des tables qui ne font que grossir : compteurs du limiteur,
 * sessions fermées, liens de réinitialisation, jetons et clients OAuth.
 *
 * Chaque étape a son propre `try` : une panne sur l'une ne doit pas priver
 * les autres de leur passage, ni faire échouer les rappels déjà envoyés.
 */
async function menageDeSecurite() {
  const etape = async <T>(nom: string, travail: () => Promise<T>) => {
    try {
      return await travail();
    } catch (error) {
      console.error(`[cron] ${nom} impossible :`, redactError(error));
      return null;
    }
  };
  const maintenant = Date.now();
  return {
    compteursEffaces: await etape("purge des compteurs du limiteur", () =>
      purgeExpiredRateLimits(),
    ),
    sessionsFermeesEffacees: await etape("purge des sessions fermées", async () =>
      (
        await db
          .delete(revokedSessions)
          .where(lt(revokedSessions.expiresAt, new Date(maintenant)))
          .returning({ id: revokedSessions.sessionId })
      ).length,
    ),
    liensDeReinitialisationEffaces: await etape(
      "purge des liens de réinitialisation",
      async () =>
        (
          await db
            .delete(passwordResetTokens)
            .where(
              lt(
                passwordResetTokens.expiresAt,
                new Date(maintenant - 24 * 60 * 60 * 1000),
              ),
            )
            .returning({ id: passwordResetTokens.id })
        ).length,
    ),
    oauth: await etape("ménage des tables OAuth", () => purgeOAuthGarbage()),
  };
}

/**
 * Le rappel des comptes en attente, sans faire tomber le reste du passage : le
 * nettoyage des fichiers et la purge des demandes expirées viennent après, et
 * n'ont pas à attendre que la base ou la messagerie aille mieux.
 *
 * Il n'a pas de colonne à lui ; le journal d'audit, qui garde de toute façon
 * la trace de ce que l'application envoie d'elle-même au bureau, sert de
 * témoin (voir `verrouQuotidien`).
 */
async function rappelerComptesEnAttente(now: Date) {
  try {
    if (await temoinDuJour(db, RAPPEL_COMPTES_EN_ATTENTE, now)) {
      return { envoye: false, dejaEnvoyeAujourdhui: true };
    }
    const [rappel, transport] = await Promise.all([
      preparePendingAccountsReminder(),
      getOutboundMailRuntimeConfig(),
    ]);
    if (!rappel.mail) {
      return {
        comptesEnAttente: rappel.comptesEnAttente,
        envoye: false,
        destinataires: 0,
      };
    }

    return await db.transaction(async (tx) => {
      await verrouQuotidien(tx, "apel-manager:rappel-comptes-en-attente");
      if (await temoinDuJour(tx, RAPPEL_COMPTES_EN_ATTENTE, now)) {
        return { envoye: false, dejaEnvoyeAujourdhui: true };
      }
      const envoi = await remindBureauOfPendingAccounts(rappel, transport);
      if (envoi.envoye) {
        await tx.insert(auditLogs).values({
          actorUserId: null,
          action: RAPPEL_COMPTES_EN_ATTENTE,
          entityType: "user",
          source: "system",
          details: {
            comptesEnAttente: envoi.comptesEnAttente,
            destinataires: envoi.destinataires,
          },
        });
      }
      return envoi;
    });
  } catch (error) {
    // Réduite avant d'aller au journal comme dans la réponse : l'erreur d'une
    // requête SQL recopie toutes ses valeurs (lib/errors.ts).
    const message = redactError(error).split("\n")[0];
    console.error("[cron] rappel des comptes en attente impossible :", message);
    return { envoye: false, erreur: message };
  }
}

/**
 * Le récapitulatif quotidien, quand l'association a choisi ce mode plutôt qu'un
 * avis par inscription.
 *
 * Deux horloges cohabitent ici, et les mélanger ferait perdre des données :
 *
 * - Les **inscriptions** sont une fenêtre. Elle part de la fin de la
 *   précédente (`signup_digest_sent_at`), et non d'un « hier » calculé : le
 *   cron peut être relancé, retardé ou rejoué après une panne, et une fenêtre
 *   fixe laisserait des inscriptions dans le trou. Elle n'avance qu'avec un
 *   envoi réussi, ou quand elle ne contenait rien.
 * - Les **tâches** sont un instantané, recalculé à chaque passage. Une tâche
 *   en retard doit revenir chaque jour tant qu'elle traîne ; elle ne « passe »
 *   pas dans la fenêtre et n'a donc rien à voir avec son avancement.
 *
 * Les **comptes en attente de validation** sont eux aussi un instantané. Ils
 * suffisent à faire partir le message : un administrateur n'a pas à guetter
 * l'écran Utilisateurs pour apprendre que quelqu'un attend d'entrer. Quand ce
 * message ne les a pas portés (autre mode, pas d'adresse de contact, envoi
 * manqué, rien à dire), `remindBureauOfPendingAccounts` les rappelle à part.
 *
 * Les **demandes de compte écartées par un plafond** suivent la fenêtre des
 * inscriptions, et suffisent elles aussi : un formulaire que quelqu'un sature
 * refuse aussi les parents, et le bureau ne l'apprendrait pas autrement.
 *
 * « Parti aujourd'hui » et « fin de la fenêtre » sont deux faits distincts, et
 * ne se lisent plus dans la même colonne. La fin de la fenêtre avance aussi
 * quand il n'y avait rien à dire ; en déduire qu'un message était parti
 * faisait croire, à un passage suivant du même jour, que les comptes en
 * attente arrivés entre-temps avaient été annoncés. Le témoin au journal, lui,
 * n'est écrit que par un envoi réussi.
 */
type TacheDue = {
  id: string;
  title: string;
  dueAt: Date;
  event: { id: string; title: string };
  assignees: { user: { name: string | null; email: string } | null }[];
};

/** L'action du journal qui atteste qu'un récapitulatif quotidien est parti. */
const RECAPITULATIF_ENVOYE = "digest.sent";

const RECAP_VIDE = {
  envoye: false,
  dejaEnvoyeAujourdhui: false,
  nouvelles: 0,
  tachesEnRetard: 0,
  tachesAVenir: 0,
  comptesEnAttente: 0,
  demandesDeCompteIgnorees: 0,
};

/**
 * Déjà parti aujourd'hui. Les chiffres sont ceux du message parti, gardés par
 * son témoin : c'est ce que le bureau a lu — et ce qui décide si les comptes
 * en attente ont besoin d'un rappel à part.
 */
function dejaParti(details: Record<string, unknown>) {
  const nombre = (cle: string) => Number(details[cle] ?? 0) || 0;
  return {
    ...RECAP_VIDE,
    mode: "quotidien",
    dejaEnvoyeAujourdhui: true,
    nouvelles: nombre("nouvelles"),
    tachesEnRetard: nombre("tachesEnRetard"),
    tachesAVenir: nombre("tachesAVenir"),
    comptesEnAttente: nombre("comptesEnAttente"),
    demandesDeCompteIgnorees: nombre("demandesDeCompteIgnorees"),
  };
}

const memeInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

async function envoyerRecapitulatif(
  association: Awaited<ReturnType<typeof getAssociationSettings>>,
  identity: NotificationIdentity,
  baseUrl: string,
  now: Date,
  dueTasks: TacheDue[],
) {
  const rien = RECAP_VIDE;
  if (association.signupNoticeMode !== "quotidien") {
    return { ...rien, mode: association.signupNoticeMode };
  }
  const destinataire = association.contactEmail?.trim();
  if (!destinataire) {
    return { ...rien, mode: "quotidien" };
  }

  // Un récapitulatif par jour, pas un par appel. La partie « tâches » est un
  // instantané qui ne s'épuise pas : rejouer le cron — une relance après une
  // panne, un double déclenchement, un appel à la main pour vérifier —
  // renvoyait le même message au bureau autant de fois.
  const deja = await temoinDuJour(db, RECAPITULATIF_ENVOYE, now);
  if (deja) return dejaParti(deja.details);

  const [ligne] = await db
    .select({ precedent: associationSettings.signupDigestSentAt })
    .from(associationSettings)
    .where(eq(associationSettings.id, "default"))
    .limit(1);
  if (!ligne) return { ...rien, mode: "quotidien" };

  // Composé hors transaction (voir `verrouQuotidien`), puis envoyé sous
  // verrou si rien n'a bougé entre-temps.
  const [recap, transport] = await Promise.all([
    composerRecapitulatif(ligne.precedent, identity, baseUrl, now, dueTasks),
    getOutboundMailRuntimeConfig(),
  ]);
  const chiffres = { ...rien, mode: "quotidien", ...recap.chiffres };

  return db.transaction(async (tx) => {
    await verrouQuotidien(tx, "apel-manager:recapitulatif-quotidien");
    const temoin = await temoinDuJour(tx, RECAPITULATIF_ENVOYE, now);
    if (temoin) return dejaParti(temoin.details);

    const [actuelle] = await tx
      .select({ precedent: associationSettings.signupDigestSentAt })
      .from(associationSettings)
      .where(eq(associationSettings.id, "default"))
      .limit(1);
    if (!actuelle || !memeInstant(actuelle.precedent, ligne.precedent)) {
      // Un passage parallèle a déplacé la fenêtre pendant la composition — il
      // n'avait rien à dire, sinon son témoin serait là. Ce message-ci
      // partirait sur une fenêtre périmée ; ce qui est arrivé depuis reste
      // dans la suivante, et le prochain passage l'annoncera.
      return { ...rien, mode: "quotidien" };
    }

    const avancerLaFenetre = () =>
      tx
        .update(associationSettings)
        .set({ signupDigestSentAt: now })
        .where(eq(associationSettings.id, "default"));

    if (!recap.message) {
      // Rien à dire : la fenêtre avance quand même, sinon elle s'allongerait
      // sans fin et finirait par reprendre des lignes déjà annoncées. Pas de
      // témoin : aucun message n'est parti, et un passage plus tard dans la
      // journée — une inscription, un compte en attente arrivés entre-temps —
      // peut encore envoyer le sien.
      await avancerLaFenetre();
      return chiffres;
    }

    const parti = await sendEmail({
      to: destinataire,
      ...recap.message,
      transport,
    });
    if (!parti) {
      // Ni témoin, ni fenêtre avancée : le passage suivant — même le jour
      // même — reprendra ces inscriptions plutôt que de les perdre.
      console.warn(
        `[cron] récapitulatif non remis à l’adresse de contact : ${chiffres.nouvelles} nouvelle(s) reportée(s), ${chiffres.tachesEnRetard} tâche(s) en retard, ${chiffres.comptesEnAttente} compte(s) en attente et ${chiffres.demandesDeCompteIgnorees} demande(s) de compte ignorée(s) non signalé(s).`,
      );
      return chiffres;
    }

    await avancerLaFenetre();
    // Des nombres seulement : ni nom, ni adresse, ni titre de tâche.
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: RECAPITULATIF_ENVOYE,
      entityType: "association_settings",
      entityId: "default",
      source: "system",
      details: {
        nouvelles: chiffres.nouvelles,
        tachesEnRetard: chiffres.tachesEnRetard,
        tachesAVenir: chiffres.tachesAVenir,
        comptesEnAttente: chiffres.comptesEnAttente,
        demandesDeCompteIgnorees: chiffres.demandesDeCompteIgnorees,
      },
    });
    return { ...chiffres, envoye: true };
  });
}

/**
 * Ce que dirait le récapitulatif, de la fin de la fenêtre précédente jusqu'à
 * `now`. Lit la base, n'envoie rien : `message` vaut `null` quand il n'y a
 * rien à dire.
 */
async function composerRecapitulatif(
  precedent: Date | null,
  identity: NotificationIdentity,
  baseUrl: string,
  now: Date,
  dueTasks: TacheDue[],
) {
  // Première fois : on ne remonte que d'une journée, sinon un basculement de
  // mode déverserait l'historique entier dans le premier message.
  const depuis = precedent ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [inscriptions, presences, comptesEnAttente] = await Promise.all([
    db
      .select({
        nom: volunteerSignups.name,
        phone: volunteerSignups.phone,
        email: volunteerSignups.email,
        creneau: volunteerSlots.title,
        eventId: events.id,
        titre: events.title,
        startAt: events.startAt,
      })
      .from(volunteerSignups)
      .innerJoin(volunteerSlots, eq(volunteerSignups.slotId, volunteerSlots.id))
      .innerJoin(events, eq(volunteerSlots.eventId, events.id))
      // Bornée des deux côtés : ce qui arrive pendant l'envoi appartient à la
      // fenêtre suivante, qui commence à `now`, et n'est pas annoncé deux fois.
      .where(
        and(
          gt(volunteerSignups.createdAt, depuis),
          lte(volunteerSignups.createdAt, now),
        ),
      ),
    db
      .select({
        nom: meetingAttendance.name,
        phone: meetingAttendance.phone,
        email: meetingAttendance.email,
        statut: meetingAttendance.status,
        eventId: events.id,
        titre: events.title,
        startAt: events.startAt,
      })
      .from(meetingAttendance)
      .innerJoin(events, eq(meetingAttendance.eventId, events.id))
      .where(
        and(
          gt(meetingAttendance.createdAt, depuis),
          lte(meetingAttendance.createdAt, now),
        ),
      ),
    // Un état, comme les tâches : on compte ce qui attend aujourd'hui, pas ce
    // qui est arrivé depuis hier. Une demande restée sans réponse revient.
    countPendingAccounts(),
  ]);
  // Une fenêtre, comme les inscriptions : ce qui a été écarté depuis le
  // dernier récapitulatif, pas un état qui reviendrait chaque jour.
  const refusParMotif = await countDroppedAccountRequests({
    depuis,
    jusqua: now,
  });
  const demandesIgnorees = totalDroppedAccountRequests(refusParMotif);

  const nouvelles = inscriptions.length + presences.length;

  // La plus vieille dette d'abord dans les retards, la plus proche d'abord
  // dans ce qui vient : dans les deux cas, ce qui presse est en haut.
  const enRetard = dueTasks
    .filter((t) => t.dueAt < now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const aVenir = dueTasks
    .filter((t) => t.dueAt >= now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const chiffres = {
    nouvelles,
    tachesEnRetard: enRetard.length,
    tachesAVenir: aVenir.length,
    comptesEnAttente,
    demandesDeCompteIgnorees: demandesIgnorees,
  };
  if (
    nouvelles === 0 &&
    enRetard.length === 0 &&
    aVenir.length === 0 &&
    comptesEnAttente === 0 &&
    demandesIgnorees === 0
  ) {
    return { chiffres, message: null };
  }

  const versTache = (t: (typeof dueTasks)[number], retard: boolean) => ({
    titre: t.title,
    evenement: t.event.title,
    url: urlTache(baseUrl, t),
    delai: retard ? formatDuree(t.dueAt, now) : formatDuree(now, t.dueAt),
    echeance: formatDateTime(t.dueAt),
    // Le nom d'abord ; l'adresse ne sert que si le compte n'en a pas.
    responsables: t.assignees
      .map((a) => a.user?.name?.trim() || a.user?.email)
      .filter((nom): nom is string => !!nom),
  });

  const taches = {
    enRetard: enRetard.map((t) => versTache(t, true)),
    aVenir: aVenir.map((t) => versTache(t, false)),
  };

  const parRendezVous = new Map<
    string,
    Parameters<typeof dailyDigestEmail>[0]["rendezVous"][number]
  >();
  const bloc = (
    id: string,
    titre: string,
    startAt: Date,
    onglet: string,
  ) => {
    let b = parRendezVous.get(id);
    if (!b) {
      b = {
        titre,
        date: formatDateTime(startAt),
        url: `${baseUrl}/dashboard/events/${id}/${onglet}`,
        inscriptions: [],
        presences: [],
      };
      parRendezVous.set(id, b);
    }
    return b;
  };

  for (const i of inscriptions) {
    bloc(i.eventId, i.titre, i.startAt, "benevoles").inscriptions.push({
      nom: i.nom,
      creneau: i.creneau,
      phone: i.phone,
      email: i.email,
    });
  }
  for (const p of presences) {
    bloc(p.eventId, p.titre, p.startAt, "presences").presences.push({
      nom: p.nom ?? "Un membre",
      statut: p.statut,
      phone: p.phone,
      email: p.email,
    });
  }

  return {
    chiffres,
    message: dailyDigestEmail({
      taches,
      comptesEnAttente: {
        nombre: comptesEnAttente,
        url: `${baseUrl}/dashboard/members`,
        formulaireFerme: accountRequestFormClosed(comptesEnAttente),
      },
      demandesDeCompteIgnorees: {
        parMotif: refusParMotif,
        url: `${baseUrl}/dashboard/members`,
      },
      rendezVous: [...parRendezVous.values()],
      depuis: formatDateTime(depuis),
      identity,
    }),
  };
}
