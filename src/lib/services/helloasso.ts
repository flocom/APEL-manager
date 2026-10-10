import "server-only";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { currentSchoolYear, schoolYearStart } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  associationMembers,
  auditLogs,
  helloassoSettings,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import {
  fetchFormItems,
  verifyHelloAssoCredentials,
  type HelloAssoCredentials,
} from "@/lib/helloasso/client";
import {
  findMembershipForm,
  hasHelloAssoLink,
  type HelloAssoFormRef,
} from "@/lib/helloasso/form-link";
import {
  findMatchingMember,
  nameKey,
  planSync,
  type PlannedMembership,
} from "@/lib/helloasso/sync-plan";
import type {
  HelloAssoReviewItem,
  HelloAssoStatus,
  HelloAssoSyncResult,
  HelloAssoSyncSummary,
} from "@/lib/helloasso/types";
import { emptyToNull } from "@/lib/utils";
import { helloassoSettingsSchema } from "@/lib/validation";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";
import {
  delaiLisible,
  hitRateLimit,
  PLAFONDS,
  rateLimitError,
} from "./rate-limit";
import { decryptSecret, encryptSecret } from "./settings-secrets";

/**
 * Synchronisation des cotisations payées sur HelloAsso.
 *
 * Le formulaire synchronisé est le lien HelloAsso de « Comment régler »
 * (réglages de l'association) ; seules les clés d'API vivent ici. Chaque
 * passage relit les adhésions de l'année scolaire en cours et met à jour la
 * liste des adhérents : création, ou paiement porté sur une fiche existante
 * non réglée. Rien n'entre en comptabilité : une cotisation HelloAsso attend
 * le virement groupé, que le rapprochement des cotisations pointe ensuite.
 */

const SETTINGS_ID = "default";
const SYNC_LOCK = "helloasso:sync";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function settingsRecord() {
  const row = (
    await db
      .select()
      .from(helloassoSettings)
      .where(eq(helloassoSettings.id, SETTINGS_ID))
      .limit(1)
  ).at(0);
  return row ?? null;
}

/** Un secret illisible (clé de chiffrement changée) se traite comme absent. */
function safeDecrypt(encrypted: string): string | null {
  try {
    return decryptSecret(encrypted);
  } catch (error) {
    console.error("[helloasso] impossible de déchiffrer le secret", redactError(error));
    return null;
  }
}

/** La phrase « Comment régler », ou rien si les réglages sont illisibles. */
async function membershipFeeNote(): Promise<string> {
  try {
    return (await getAssociationSettings()).membershipFeeNote ?? "";
  } catch (error) {
    console.warn("[helloasso] réglages de l’association indisponibles", redactError(error));
    return "";
  }
}

// ---------------------------------------------------------------------------
// État et réglages
// ---------------------------------------------------------------------------

/**
 * L'état affiché par les écrans. Ne lève jamais — table vide, migration pas
 * encore passée, base injoignable : tout se lit « non configuré » — et ne
 * renvoie jamais le secret.
 */
export async function getHelloAssoStatus(): Promise<HelloAssoStatus> {
  let row: Awaited<ReturnType<typeof settingsRecord>> = null;
  try {
    row = await settingsRecord();
  } catch (error) {
    console.warn("[helloasso] réglages indisponibles", redactError(error));
  }
  const note = await membershipFeeNote();
  const status = row?.lastSyncStatus;
  return {
    configured: Boolean(row?.clientId && row.encryptedClientSecret),
    clientId: row?.clientId ?? null,
    clientSecretLastFour: row?.clientSecretLastFour ?? null,
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    form: findMembershipForm(note),
    linkDetected: hasHelloAssoLink(note),
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: status === "success" || status === "failed" ? status : null,
    lastSyncError: row?.lastSyncError ?? null,
    lastSyncSummary: row?.lastSyncSummary ?? null,
  };
}

/**
 * Enregistre (ou efface) les clés d'API. Elles sont essayées aussitôt auprès
 * de HelloAsso : des clés refusées ne s'enregistrent pas (400), et un
 * HelloAsso injoignable empêche de les confirmer (502).
 */
export async function saveHelloAssoSettings(
  input: unknown,
  actor: AuditActor,
): Promise<HelloAssoStatus> {
  const data = helloassoSettingsSchema.parse(input);
  const current = await settingsRecord();

  if (data.clear) {
    const values = {
      clientId: null,
      encryptedClientSecret: null,
      clientSecretLastFour: null,
      verifiedAt: null,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(helloassoSettings)
        .values({ id: SETTINGS_ID, ...values })
        .onConflictDoUpdate({ target: helloassoSettings.id, set: values });
      await recordAudit(
        actor,
        "helloasso.settings_update",
        "helloasso_settings",
        SETTINGS_ID,
        { cleared: true },
        tx,
      );
    });
    return getHelloAssoStatus();
  }

  const newSecret = emptyToNull(data.clientSecret);
  const clientId = emptyToNull(data.clientId) ?? current?.clientId ?? null;
  const clientIdChanged = clientId !== (current?.clientId ?? null);
  // Un secret ne vaut que pour l'identifiant avec lequel il a été saisi :
  // changer l'un sans l'autre, c'est présenter à HelloAsso une paire qui
  // n'existe pas.
  if (clientIdChanged && current?.encryptedClientSecret && !newSecret) {
    throw new HttpError(
      400,
      "L’identifiant client a changé : saisissez aussi le secret client qui va avec.",
    );
  }
  const clientSecret =
    newSecret ??
    (current?.encryptedClientSecret
      ? safeDecrypt(current.encryptedClientSecret)
      : null);
  if (!clientId || !clientSecret) {
    throw new HttpError(
      400,
      current?.encryptedClientSecret && !clientSecret
        ? "Le secret client enregistré est illisible (clé de chiffrement changée) : saisissez-le de nouveau."
        : "Renseignez l’identifiant et le secret client HelloAsso.",
    );
  }

  await verifyHelloAssoCredentials({ clientId, clientSecret });

  const values = {
    clientId,
    encryptedClientSecret: newSecret
      ? encryptSecret(newSecret)
      : (current?.encryptedClientSecret ?? null),
    clientSecretLastFour: newSecret
      ? newSecret.slice(-4)
      : (current?.clientSecretLastFour ?? null),
    verifiedAt: new Date(),
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(helloassoSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: helloassoSettings.id, set: values });
    // Des booléens seulement : ni le secret, ni ses derniers caractères.
    await recordAudit(
      actor,
      "helloasso.settings_update",
      "helloasso_settings",
      SETTINGS_ID,
      { clientIdChanged, secretChanged: Boolean(newSecret), cleared: false },
      tx,
    );
  });
  return getHelloAssoStatus();
}

/**
 * La tâche planifiée a-t-elle de quoi tourner ? Sans clés ou sans formulaire
 * dans « Comment régler », elle passe son tour sans rien écrire.
 */
export async function isHelloAssoSyncReady(): Promise<
  { ready: true } | { ready: false; reason: "no_keys" | "no_form" }
> {
  const status = await getHelloAssoStatus();
  if (!status.configured) return { ready: false, reason: "no_keys" };
  if (!status.form) return { ready: false, reason: "no_form" };
  return { ready: true };
}

/** Plafond du bouton « Synchroniser » (écran et MCP), par administrateur. */
export async function assertHelloAssoSyncAllowed(userId: string): Promise<void> {
  const verdict = await hitRateLimit(PLAFONDS.syncHelloAsso, userId);
  if (!verdict.ok) {
    throw rateLimitError(
      verdict,
      `Trop de synchronisations HelloAsso en peu de temps. Réessayez ${delaiLisible(verdict.retryAfterSeconds)}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Synchronisation
// ---------------------------------------------------------------------------

/**
 * Une ligne au journal, dans la transaction. Sans acteur — la tâche
 * planifiée —, la ligne est écrite au nom du système, comme le fait le cron
 * des notifications : `recordAudit` exige un utilisateur.
 */
async function journal(
  tx: Transaction,
  actor: AuditActor | null,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  if (actor) {
    await recordAudit(actor, action, entityType, entityId, details, tx);
    return;
  }
  await tx.insert(auditLogs).values({
    actorUserId: null,
    action,
    entityType,
    entityId,
    source: "system",
    details,
  });
}

function reviewItem(
  m: PlannedMembership,
  reason: HelloAssoReviewItem["reason"],
  memberId: string | null,
): HelloAssoReviewItem {
  return {
    itemId: m.itemId,
    orderId: m.orderId,
    orderDate: m.orderDate.toISOString(),
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    amountCents: m.feeCents + m.donationCents,
    reason,
    memberId,
  };
}

/**
 * Applique le plan sous verrou. Rien ne passe par `db` ici : sur Vercel le
 * pool n'a qu'une connexion, celle que la transaction occupe.
 */
async function applyPlan(
  tx: Transaction,
  memberships: PlannedMembership[],
  schoolYear: string,
  actor: AuditActor | null,
): Promise<Pick<HelloAssoSyncSummary, "created" | "updated" | "unchanged" | "review">> {
  // Deux synchronisations simultanées (bouton et tâche planifiée) créeraient
  // chacune les mêmes adhérents : la seconde attend la fin de la première.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SYNC_LOCK}))`);

  const itemIds = memberships.map((m) => m.itemId);
  const imported = new Map(
    itemIds.length
      ? (
          await tx
            .select({
              id: associationMembers.id,
              itemId: associationMembers.helloassoItemId,
            })
            .from(associationMembers)
            .where(inArray(associationMembers.helloassoItemId, itemIds))
        ).map((r) => [r.itemId as string, r.id])
      : [],
  );

  const yearMembers = await tx
    .select({
      id: associationMembers.id,
      firstName: associationMembers.firstName,
      lastName: associationMembers.lastName,
      email: associationMembers.email,
      addressLine1: associationMembers.addressLine1,
      postalCode: associationMembers.postalCode,
      city: associationMembers.city,
      feePaidAt: associationMembers.feePaidAt,
      version: associationMembers.version,
      helloassoItemId: associationMembers.helloassoItemId,
    })
    .from(associationMembers)
    .where(eq(associationMembers.schoolYear, schoolYear));
  // Fiches que la synchronisation peut compléter : pas encore reliées.
  let candidates = yearMembers.filter((r) => r.helloassoItemId === null);
  // Personnes déjà importées cette année depuis une autre adhésion : un second
  // paiement au même nom est un doublon à regarder, pas un nouvel adhérent.
  const alreadyImported = new Map(
    yearMembers
      .filter((r) => r.helloassoItemId !== null)
      .map((r) => [nameKey(r.firstName, r.lastName), r.id]),
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const review: HelloAssoReviewItem[] = [];
  const now = new Date();

  for (const m of memberships) {
    const importedId = imported.get(m.itemId);
    if (importedId) {
      // La fiche n'est pas touchée : le bureau décide d'un remboursement.
      if (m.status === "refunded") review.push(reviewItem(m, "refunded", importedId));
      else unchanged += 1;
      continue;
    }
    // Annulée avant d'avoir été importée : rien à faire.
    if (m.status === "refunded") continue;

    const match = findMatchingMember(candidates, m);
    if (m.status === "pending") {
      review.push(reviewItem(m, "pending", match?.id ?? null));
      continue;
    }

    if (match && match.feePaidAt === null) {
      const fields = {
        status: "active" as const,
        membershipFeeCents: m.feeCents,
        donationCents: m.donationCents,
        feePaidAt: m.orderDate,
        feePaymentMethod: "helloasso" as const,
        helloassoItemId: m.itemId,
        helloassoOrderId: m.orderId,
        // Les coordonnées saisies par le bureau priment : on ne remplit que
        // les champs vides, et l'adresse en bloc — une rue HelloAsso sous une
        // ville saisie à la main ne ferait pas une adresse.
        ...(match.email || !m.email ? {} : { email: m.email }),
        ...(match.addressLine1 || match.postalCode || match.city || !m.addressLine1
          ? {}
          : {
              addressLine1: m.addressLine1,
              postalCode: m.postalCode,
              city: m.city,
            }),
      };
      const [row] = await tx
        .update(associationMembers)
        .set({ ...fields, version: match.version + 1, updatedAt: now })
        .where(
          and(
            eq(associationMembers.id, match.id),
            eq(associationMembers.version, match.version),
            isNull(associationMembers.helloassoItemId),
            isNull(associationMembers.feePaidAt),
          ),
        )
        .returning({ id: associationMembers.id });
      // Modifiée à l'écran entre-temps : reprise au prochain passage.
      if (!row) continue;
      candidates = candidates.filter((c) => c.id !== match.id);
      alreadyImported.set(nameKey(match.firstName, match.lastName), match.id);
      updated += 1;
      await journal(tx, actor, "adherent.update", "association_member", match.id, {
        source: "helloasso",
        itemId: m.itemId,
        changedFields: Object.keys(fields),
      });
      continue;
    }

    const duplicateOf =
      match?.id ?? alreadyImported.get(nameKey(m.firstName, m.lastName));
    if (duplicateOf) {
      review.push(reviewItem(m, "possible_duplicate", duplicateOf));
      continue;
    }

    const [member] = await tx
      .insert(associationMembers)
      .values({
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        addressLine1: m.addressLine1,
        postalCode: m.postalCode,
        city: m.city,
        country: m.country,
        status: "active",
        schoolYear,
        membershipFeeCents: m.feeCents,
        donationCents: m.donationCents,
        feePaidAt: m.orderDate,
        feePaymentMethod: "helloasso",
        joinedAt: m.orderDate,
        notes: `Adhésion payée sur HelloAsso (commande n° ${m.orderId}).`,
        helloassoItemId: m.itemId,
        helloassoOrderId: m.orderId,
      })
      .returning({ id: associationMembers.id });
    alreadyImported.set(nameKey(m.firstName, m.lastName), member.id);
    created += 1;
    await journal(tx, actor, "adherent.create", "association_member", member.id, {
      source: "helloasso",
      itemId: m.itemId,
      schoolYear,
      status: "active",
    });
  }

  return { created, updated, unchanged, review };
}

/** Le message gardé pour l'écran quand une synchronisation échoue. */
function failureMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  return `Erreur inattendue pendant la synchronisation (${redactError(error).split("\n")[0]}).`.slice(
    0,
    500,
  );
}

/**
 * Relit les adhésions de l'année scolaire en cours sur HelloAsso et met à jour
 * la liste des adhérents. `actor` vaut null pour la tâche planifiée.
 *
 * Erreurs : 400 sans clés, sans formulaire, clés refusées ou formulaire
 * introuvable ; 502 si HelloAsso est injoignable ou en panne. Un échec après
 * le départ est consigné (`lastSyncStatus = failed`) pour l'écran.
 */
export async function syncHelloAsso({
  trigger,
  actor,
}: {
  trigger: HelloAssoSyncSummary["trigger"];
  actor: AuditActor | null;
}): Promise<HelloAssoSyncResult> {
  const row = await settingsRecord();
  if (!row?.clientId || !row.encryptedClientSecret) {
    throw new HttpError(
      400,
      "Ajoutez les clés d’API HelloAsso dans Configuration pour synchroniser les adhésions.",
    );
  }
  const form: HelloAssoFormRef | null = findMembershipForm(
    await membershipFeeNote(),
  );
  if (!form) {
    throw new HttpError(
      400,
      "Aucun formulaire HelloAsso d’adhésion dans « Comment régler » : collez-y le lien de votre formulaire, dans Configuration.",
    );
  }

  const startedAt = new Date();
  try {
    const clientSecret = safeDecrypt(row.encryptedClientSecret);
    if (!clientSecret) {
      throw new HttpError(
        400,
        "Le secret client HelloAsso enregistré est illisible (clé de chiffrement changée) : saisissez-le de nouveau dans Configuration.",
      );
    }
    const credentials: HelloAssoCredentials = {
      clientId: row.clientId,
      clientSecret,
    };
    const schoolYear = currentSchoolYear();
    const from = schoolYearStart(schoolYear);
    // Lu avant la transaction : on ne garde pas un verrou pendant les appels
    // réseau.
    const items = await fetchFormItems(credentials, form, from);
    const plan = planSync(items, from, startedAt);

    const summary = await db.transaction(async (tx) => {
      const result = await applyPlan(tx, plan.memberships, schoolYear, actor);
      const summary: HelloAssoSyncSummary = {
        startedAt: startedAt.toISOString(),
        schoolYear,
        form,
        fetched: plan.fetched,
        ...result,
        trigger,
      };
      // Des nombres seulement : ni nom, ni adresse.
      await journal(tx, actor, "helloasso.sync", "helloasso_settings", SETTINGS_ID, {
        trigger,
        schoolYear,
        formSlug: form.formSlug,
        fetched: summary.fetched,
        created: summary.created,
        updated: summary.updated,
        unchanged: summary.unchanged,
        review: summary.review.length,
      });
      await tx
        .update(helloassoSettings)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
          lastSyncError: null,
          lastSyncSummary: summary,
        })
        .where(eq(helloassoSettings.id, SETTINGS_ID));
      return summary;
    });
    return { summary, status: await getHelloAssoStatus() };
  } catch (error) {
    if (!(error instanceof HttpError)) {
      console.error("[helloasso] synchronisation interrompue", redactError(error));
    }
    try {
      // Le dernier bilan réussi reste affiché, avec l'erreur à côté.
      await db
        .update(helloassoSettings)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: "failed",
          lastSyncError: failureMessage(error),
        })
        .where(
          and(
            eq(helloassoSettings.id, SETTINGS_ID),
            isNotNull(helloassoSettings.clientId),
          ),
        );
    } catch (storeError) {
      console.error("[helloasso] échec non consigné", redactError(storeError));
    }
    throw error;
  }
}
