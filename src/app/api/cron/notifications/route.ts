import { timingSafeEqual } from "node:crypto";

import { and, eq, gt, inArray, isNull, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { formatDateTime, formatDuree } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  associationSettings,
  events,
  meetingAttendance,
  notificationsLog,
  tasks,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";
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
import { getBaseUrl } from "@/lib/base-url";
import { totalDroppedAccountRequests } from "@/lib/labels";
import {
  accountRequestFormClosed,
  countDroppedAccountRequests,
  purgeExpiredAccountRequests,
  remindBureauOfPendingAccounts,
} from "@/lib/services/account-requests";
import { collectReferencedUploadIds } from "@/lib/services/uploads-references";
import { countPendingAccounts } from "@/lib/services/user-accounts";
import { cleanupOrphanedUploads } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const [association, telegramBotToken] = await Promise.all([
    getAssociationSettings(),
    getTelegramBotToken(),
  ]);
  const appUrl = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/$/, "");

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

  // 2) Récupérer en UNE requête les notifications déjà envoyées (anti-doublon).
  const taskIds = [...new Set(dueTasks.map((t) => t.id))];
  const existing = taskIds.length
    ? await db
        .select({
          taskId: notificationsLog.taskId,
          userId: notificationsLog.userId,
          kind: notificationsLog.kind,
        })
        .from(notificationsLog)
        .where(inArray(notificationsLog.taskId, taskIds))
    : [];
  const alreadySent = new Set(
    existing.map((e) => `${e.taskId}:${e.userId}:${e.kind}`),
  );

  const todo = candidates.filter(
    (c) => !alreadySent.has(`${c.task.id}:${c.user.id}:${c.kind}`),
  );
  const skipped = candidates.length - todo.length;

  // 3) Envoyer tous les rappels en parallèle.
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
        taskUrl: urlTache(appUrl, c.task),
        identity: notificationIdentity,
        telegramBotToken,
      });
      return { c, ok };
    }),
  );

  // 4) Journaliser en un seul insert ceux qui ont réussi (les échecs seront
  //    réessayés au prochain passage).
  const succeeded = results.filter((r) => r.ok).map((r) => r.c);
  if (succeeded.length > 0) {
    await db
      .insert(notificationsLog)
      .values(
        succeeded.map((c) => ({
          taskId: c.task.id,
          userId: c.user.id,
          kind: c.kind,
        })),
      )
      .onConflictDoNothing();
  }

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
  const signups = appUrl
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

  // Envois en parallèle puis un seul UPDATE groupé (au lieu de N en série).
  const remindedIds = (
    await Promise.all(
      eligibleSignups.map(async (s) => {
        const ev = s.slot.event;
        const mail = volunteerReminderEmail({
          name: s.name,
          eventTitle: ev.title,
          eventDate: formatDateTime(ev.startAt),
          slotTitle: s.slot.title,
          location: ev.location,
          cancelUrl: s.cancelToken
            ? `${appUrl}/annulation/${s.cancelToken}`
            : appUrl,
          identity: notificationIdentity,
        });
        const ok = await sendEmail({ to: s.email as string, ...mail });
        return ok ? s.id : null;
      }),
    )
  ).filter((id): id is string => id !== null);

  if (remindedIds.length > 0) {
    await db
      .update(volunteerSignups)
      .set({ remindedAt: new Date() })
      .where(inArray(volunteerSignups.id, remindedIds));
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
    now,
    dueTasks,
  );

  // --- Comptes en attente de validation, quel que soit le mode d'avis --------
  // Le récapitulatif les porte déjà quand il part : un second message ne dirait
  // rien de plus. Sinon — mode « immédiat » ou « aucun », pas d'adresse de
  // contact, envoi manqué — un rappel à part s'en charge. Une personne bloquée
  // à l'entrée ne doit pas dépendre du réglage des avis d'inscription.
  const rappelComptesEnAttente =
    digest.envoye && digest.comptesEnAttente > 0
      ? { dansLeRecapitulatif: true, comptesEnAttente: digest.comptesEnAttente }
      : { dansLeRecapitulatif: false, ...(await rappelerComptesEnAttente()) };

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
      error instanceof Error ? error.message : error,
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
      error instanceof Error ? error.message : error,
    );
  }

  return NextResponse.json({
    ok: true,
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

/**
 * Le rappel des comptes en attente, sans faire tomber le reste du passage : le
 * nettoyage des fichiers et la purge des demandes expirées viennent après, et
 * n'ont pas à attendre que la base ou la messagerie aille mieux.
 */
async function rappelerComptesEnAttente() {
  try {
    return await remindBureauOfPendingAccounts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
 * - Les **inscriptions** sont une fenêtre. Elle part de la dernière fois où le
 *   récapitulatif est parti, et non d'un « hier » calculé : le cron peut être
 *   relancé, retardé ou rejoué après une panne, et une fenêtre fixe laisserait
 *   des inscriptions dans le trou. Elle n'avance qu'après un envoi réussi.
 * - Les **tâches** sont un instantané, recalculé à chaque passage. Une tâche
 *   en retard doit revenir chaque jour tant qu'elle traîne ; elle ne « passe »
 *   pas dans la fenêtre et n'a donc rien à voir avec son avancement.
 *
 * Les **comptes en attente de validation** sont eux aussi un instantané. Ils
 * suffisent à faire partir le message : un administrateur n'a pas à guetter
 * l'écran Utilisateurs pour apprendre que quelqu'un attend d'entrer. Quand ce
 * message ne part pas (autre mode, pas d'adresse de contact, envoi manqué),
 * `remindBureauOfPendingAccounts` les rappelle à part.
 *
 * Les **demandes de compte écartées par un plafond** suivent la fenêtre des
 * inscriptions, et suffisent elles aussi : un formulaire que quelqu'un sature
 * refuse aussi les parents, et le bureau ne l'apprendrait pas autrement.
 */
async function envoyerRecapitulatif(
  association: Awaited<ReturnType<typeof getAssociationSettings>>,
  identity: NotificationIdentity,
  now: Date,
  dueTasks: {
    id: string;
    title: string;
    dueAt: Date;
    event: { id: string; title: string };
    assignees: { user: { name: string | null; email: string } | null }[];
  }[],
) {
  if (association.signupNoticeMode !== "quotidien") {
    return {
      mode: association.signupNoticeMode,
      envoye: false,
      nouvelles: 0,
      tachesEnRetard: 0,
      tachesAVenir: 0,
      comptesEnAttente: 0,
      demandesDeCompteIgnorees: 0,
    };
  }
  const destinataire = association.contactEmail?.trim();
  if (!destinataire) {
    return {
      mode: "quotidien",
      envoye: false,
      nouvelles: 0,
      tachesEnRetard: 0,
      tachesAVenir: 0,
      comptesEnAttente: 0,
      demandesDeCompteIgnorees: 0,
    };
  }

  // Première fois : on ne remonte que d'une journée, sinon un basculement de
  // mode déverserait l'historique entier dans le premier message.
  const depuis =
    association.signupDigestSentAt ??
    new Date(now.getTime() - 24 * 60 * 60 * 1000);

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
      .where(gt(volunteerSignups.createdAt, depuis)),
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
      .where(gt(meetingAttendance.createdAt, depuis)),
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

  if (
    nouvelles === 0 &&
    enRetard.length === 0 &&
    aVenir.length === 0 &&
    comptesEnAttente === 0 &&
    demandesIgnorees === 0
  ) {
    // Rien à dire : on avance quand même la fenêtre, sinon elle s'allonge sans
    // fin et finirait par reprendre des lignes déjà annoncées.
    await db
      .update(associationSettings)
      .set({ signupDigestSentAt: now })
      .where(eq(associationSettings.id, "default"));
    return {
      mode: "quotidien",
      envoye: false,
      nouvelles: 0,
      tachesEnRetard: 0,
      tachesAVenir: 0,
      comptesEnAttente: 0,
      demandesDeCompteIgnorees: 0,
    };
  }

  const baseUrl = await getBaseUrl();

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

  const parti = await sendEmail({
    to: destinataire,
    ...dailyDigestEmail({
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
  });

  if (parti) {
    await db
      .update(associationSettings)
      .set({ signupDigestSentAt: now })
      .where(eq(associationSettings.id, "default"));
  } else {
    // Fenêtre laissée ouverte à dessein : le passage suivant reprendra ces
    // inscriptions plutôt que de les perdre.
    console.warn(
      `[cron] récapitulatif non remis à ${destinataire} : ${nouvelles} nouvelle(s) reportée(s), ${enRetard.length} tâche(s) en retard, ${comptesEnAttente} compte(s) en attente et ${demandesIgnorees} demande(s) de compte ignorée(s) non signalé(s).`,
    );
  }

  return {
    mode: "quotidien",
    envoye: parti,
    nouvelles,
    tachesEnRetard: enRetard.length,
    tachesAVenir: aVenir.length,
    comptesEnAttente,
    demandesDeCompteIgnorees: demandesIgnorees,
  };
}
