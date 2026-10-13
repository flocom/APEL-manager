import "server-only";

import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { secureLinkBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import {
  associationMembers,
  auditLogs,
  memberUpdateRequests,
  users,
} from "@/lib/db/schema";
import {
  CIVILITIES,
  isCivility,
  isFrance,
  isFrenchPostalCode,
  memberCompleteness,
  type MemberInfoField,
} from "@/lib/member-info/completeness";
import type {
  MemberRelanceRequest,
  MemberRelanceResult,
  MemberRelanceTarget,
  MemberSingleRelanceResult,
  MemberUpdateRequestView,
  PublicMemberForm,
  PublicMemberUpdateInput,
} from "@/lib/member-info/types";
import { sendEmail } from "@/lib/notifications/email";
import { memberUpdateRequestEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { recordAudit, type AuditActor } from "@/lib/services/audit";
import { redactError } from "@/lib/errors";
import {
  getOutboundMailRuntimeConfig,
  type OutboundMailRuntimeConfig,
} from "@/lib/services/mail-settings";
import {
  delaiLisible,
  hitRateLimitStages,
  PLAFONDS,
  rateLimitError,
} from "@/lib/services/rate-limit";
import { generateToken, hashToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";

/**
 * Les liens qui permettent à une famille de compléter elle-même sa fiche
 * d'adhérent (adresse postale, civilité, téléphone…), sans compte.
 *
 * Le jeton (32 octets aléatoires) ne vit que dans l'e-mail : la base n'en
 * garde que l'empreinte SHA-256, cherchée par égalité dans un index unique.
 * Un lien vaut 30 jours ; un nouveau lien pour la même fiche révoque les
 * précédents. Expiré, révoqué ou inconnu, un lien reçoit la même réponse :
 * rien ne dit à qui essaie s'il a deviné juste à moitié.
 */

const JOUR_MS = 24 * 60 * 60 * 1000;
/** Durée de validité d'un lien. */
export const VALIDITE_LIEN_JOURS = 30;
/** Une famille relancée il y a moins de 7 jours est laissée de côté. */
const RELANCE_RECENTE_MS = 7 * JOUR_MS;
/**
 * En deçà, même « inclure les relances récentes » ne renvoie pas : le lien
 * qui vient de partir serait révoqué avant même d'être ouvert.
 */
const RELANCE_TROP_PROCHE_MS = 10 * 60 * 1000;
/** Plafond d'un envoi groupé : au-delà, la réputation d'envoi trinque. */
export const MAX_DESTINATAIRES_RELANCE = 300;
/** Envois menés de front : les fournisseurs limitent le débit. */
const LOT = 5;

const MESSAGE_LIEN_INVALIDE =
  "Ce lien n’est plus valable : il a expiré, ou un lien plus récent vous a été envoyé. Écrivez à l’association pour en recevoir un nouveau.";

const anneeScolaire = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027")
  .refine((value) => {
    const [start, end] = value.split("-").map(Number);
    return end === start + 1;
  }, "Les deux années doivent être consécutives");

export const memberRelanceRequestSchema = z.object({
  schoolYear: anneeScolaire,
  scope: z.enum(["required", "any"]).default("required"),
  includeRecent: z.boolean().default(false),
  message: z.string().trim().max(2000).nullable().optional(),
  // Sans précision, on prévisualise : un envoi se demande explicitement.
  dryRun: z.boolean().default(true),
}) satisfies z.ZodType<MemberRelanceRequest, z.ZodTypeDef, unknown>;

const adresseEmail = z.string().trim().toLowerCase().email();

function emailValide(value: string | null): string | null {
  if (!value) return null;
  const lu = adresseEmail.safeParse(value);
  return lu.success ? lu.data : null;
}

/** Ce qui manque, obligatoire d'abord, l'e-mail en moins quand il est là. */
function champsManquants(member: Parameters<typeof memberCompleteness>[0]) {
  const { required, recommended } = memberCompleteness(member);
  return { required, recommended, missing: [...required, ...recommended] };
}

function instant(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Envoi d'un lien
// ---------------------------------------------------------------------------

type MembreARelancer = {
  id: string;
  firstName: string;
  lastName: string;
  civility: string | null;
  email: string;
  schoolYear: string;
  missing: MemberInfoField[];
};

type ContexteEnvoi = {
  transport: OutboundMailRuntimeConfig;
  baseUrl: string;
  identity: Awaited<ReturnType<typeof getNotificationIdentity>>;
  contactEmail: string | null;
  message: string | null;
};

/**
 * Ce qu'il faut pour envoyer : un transport et l'adresse publique du site.
 * Sans l'un ou l'autre, rien ne part — et l'administrateur le lit, plutôt
 * qu'un « 0 envoyé » sans explication.
 */
async function contexteEnvoi(message: string | null): Promise<ContexteEnvoi> {
  const transport = await getOutboundMailRuntimeConfig();
  if (!transport) {
    throw new HttpError(
      400,
      "Les e-mails sortants ne sont pas configurés : réglez la messagerie dans Configuration avant d’envoyer les liens.",
    );
  }
  const baseUrl = secureLinkBaseUrl("Lien pour compléter une fiche d’adhérent");
  if (!baseUrl) {
    throw new HttpError(
      400,
      "L’adresse publique du site (APP_URL) n’est pas configurée : les liens personnels ne peuvent pas partir.",
    );
  }
  const settings = await getAssociationSettings();
  return {
    transport,
    baseUrl,
    identity: await getNotificationIdentity(settings),
    contactEmail: settings.contactEmail?.trim() || null,
    message,
  };
}

/** L'e-mail n'est pas parti : la transaction est annulée. */
class EnvoiEchoue extends Error {}

type IssueEnvoi =
  | { statut: "envoye"; view: MemberUpdateRequestView }
  | { statut: "echec" }
  /** Un lien est parti il y a moins de 10 minutes (double clic, envoi concurrent). */
  | { statut: "trop_proche" };

/**
 * Crée le lien d'une fiche et l'envoie, dans une même transaction : si
 * l'e-mail ne part pas, rien n'est enregistré et les liens précédents restent
 * valables. Le transport est passé tout lu à `sendEmail`, qui n'a ainsi pas à
 * relire la base pendant que la transaction tient la connexion.
 *
 * La fiche est verrouillée le temps de l'envoi : deux envois lancés ensemble
 * (deux onglets, un double clic sur « Envoyer ») ne font partir qu'un e-mail,
 * le second voit le lien du premier et s'arrête.
 */
async function creerEtEnvoyerLien(
  membre: MembreARelancer,
  contexte: ContexteEnvoi,
  actor: AuditActor,
): Promise<IssueEnvoi> {
  const token = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VALIDITE_LIEN_JOURS * JOUR_MS);

  try {
    return await db.transaction(async (tx): Promise<IssueEnvoi> => {
      await tx
        .select({ id: associationMembers.id })
        .from(associationMembers)
        .where(eq(associationMembers.id, membre.id))
        .for("update");
      const [dernier] = await tx
        .select({ id: memberUpdateRequests.id })
        .from(memberUpdateRequests)
        .where(
          and(
            eq(memberUpdateRequests.memberId, membre.id),
            gt(
              memberUpdateRequests.createdAt,
              new Date(now.getTime() - RELANCE_TROP_PROCHE_MS),
            ),
          ),
        )
        .limit(1);
      if (dernier) return { statut: "trop_proche" };

      await tx
        .update(memberUpdateRequests)
        .set({ revokedAt: now })
        .where(
          and(
            eq(memberUpdateRequests.memberId, membre.id),
            isNull(memberUpdateRequests.revokedAt),
            gt(memberUpdateRequests.expiresAt, now),
          ),
        );
      const [request] = await tx
        .insert(memberUpdateRequests)
        .values({
          memberId: membre.id,
          tokenHash: hashToken(token),
          sentTo: membre.email,
          expiresAt,
          createdBy: actor.userId,
          createdAt: now,
        })
        .returning();

      const mail = memberUpdateRequestEmail({
        civility: isCivility(membre.civility) ? membre.civility : null,
        firstName: membre.firstName,
        lastName: membre.lastName,
        schoolYear: membre.schoolYear,
        missing: membre.missing.filter((field) => field !== "email"),
        message: contexte.message,
        formUrl: `${contexte.baseUrl}/adhesion/${token}`,
        expiresAt,
        contactEmail: contexte.contactEmail,
        identity: contexte.identity,
      });
      const sent = await sendEmail({
        to: membre.email,
        ...mail,
        ...(contexte.contactEmail ? { replyTo: contexte.contactEmail } : {}),
        transport: contexte.transport,
      });
      if (!sent) throw new EnvoiEchoue();

      return {
        statut: "envoye",
        view: {
          id: request.id,
          sentTo: request.sentTo,
          createdAt: request.createdAt.toISOString(),
          expiresAt: request.expiresAt.toISOString(),
          completedAt: null,
          revokedAt: null,
          createdByName: null,
        },
      };
    });
  } catch (error) {
    // L'échec du transport est déjà au journal, sans l'adresse (`sendEmail`).
    if (error instanceof EnvoiEchoue) return { statut: "echec" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Relance groupée
// ---------------------------------------------------------------------------

/**
 * Prévisualise (`dryRun`) ou envoie les relances d'une année scolaire.
 *
 * Sont concernées les fiches de l'année encore actives ou en attente où il
 * manque une information obligatoire (`scope: "required"`), ou aussi le
 * téléphone ou le numéro de voie (`"any"`). Une fiche sans adresse e-mail
 * valable ne peut pas recevoir de lien : elle est rendue à part
 * (`withoutEmail`), pour que le bureau appelle la famille. Une fiche relancée
 * il y a moins de 7 jours est laissée de côté (`recent`), sauf
 * `includeRecent` — et jamais avant 10 minutes.
 */
export async function previewOrSendRelances(
  input: unknown,
  actor: AuditActor,
): Promise<MemberRelanceResult> {
  const request = memberRelanceRequestSchema.parse(input);
  const now = Date.now();

  const membres = await db
    .select({
      id: associationMembers.id,
      firstName: associationMembers.firstName,
      lastName: associationMembers.lastName,
      civility: associationMembers.civility,
      email: associationMembers.email,
      phone: associationMembers.phone,
      streetNumber: associationMembers.streetNumber,
      addressLine1: associationMembers.addressLine1,
      addressLine2: associationMembers.addressLine2,
      locality: associationMembers.locality,
      postalCode: associationMembers.postalCode,
      city: associationMembers.city,
      country: associationMembers.country,
      nationalFeeElsewhere: associationMembers.nationalFeeElsewhere,
      otherSchoolName: associationMembers.otherSchoolName,
      schoolYear: associationMembers.schoolYear,
      lastRequestedAt: sql<Date | string | null>`(
        select max(${memberUpdateRequests.createdAt})
        from ${memberUpdateRequests}
        where ${memberUpdateRequests.memberId} = ${associationMembers.id}
      )`,
    })
    .from(associationMembers)
    .where(
      and(
        eq(associationMembers.schoolYear, request.schoolYear),
        ne(associationMembers.status, "inactive"),
      ),
    )
    .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName));

  const targets: Array<MemberRelanceTarget & { civility: string | null }> = [];
  const withoutEmail: MemberRelanceTarget[] = [];
  const recent: MemberRelanceTarget[] = [];

  for (const membre of membres) {
    const { required, recommended, missing } = champsManquants(membre);
    const concerne =
      required.length > 0 ||
      (request.scope === "any" &&
        recommended.some((field) => field !== "email"));
    if (!concerne) continue;

    // Le `max()` d'une sous-requête revient en texte avec le pilote postgres.
    const derniere = membre.lastRequestedAt
      ? new Date(membre.lastRequestedAt)
      : null;
    const email = emailValide(membre.email);
    const cible: MemberRelanceTarget = {
      memberId: membre.id,
      firstName: membre.firstName,
      lastName: membre.lastName,
      email,
      missing,
      lastRequestedAt: instant(derniere),
    };

    if (!email) {
      withoutEmail.push(cible);
      continue;
    }
    const ecart = derniere ? now - derniere.getTime() : Infinity;
    if (
      ecart < RELANCE_TROP_PROCHE_MS ||
      (ecart < RELANCE_RECENTE_MS && !request.includeRecent)
    ) {
      recent.push(cible);
      continue;
    }
    targets.push({ ...cible, civility: membre.civility });
  }

  const resultat = (sent: number, failed: number): MemberRelanceResult => ({
    targets: targets.map(({ civility: _civility, ...cible }) => cible),
    withoutEmail,
    recent,
    sent,
    failed,
    dryRun: request.dryRun,
  });

  if (request.dryRun) return resultat(0, 0);

  if (targets.length === 0) {
    throw new HttpError(400, "Aucune famille à relancer avec ces critères.");
  }
  if (targets.length > MAX_DESTINATAIRES_RELANCE) {
    throw new HttpError(
      400,
      `${targets.length} familles à relancer : au plus ${MAX_DESTINATAIRES_RELANCE} par envoi. Relancez d’abord les fiches où manque une information obligatoire, puis les autres.`,
    );
  }

  const contexte = await contexteEnvoi(emptyToNull(request.message));

  // Réservé avant l'envoi, rendu si personne n'a rien reçu : un transport en
  // panne ne doit pas faire refuser le renvoi, une fois réparé.
  const quota = await hitRateLimitStages([
    [[PLAFONDS.relancesGroupees, actor.userId]],
  ]);
  if (!quota.verdict.ok) {
    await quota.release();
    throw rateLimitError(
      quota.verdict,
      `Vous avez déjà fait partir ${PLAFONDS.relancesGroupees.limit} relances groupées cette heure-ci : réessayez ${delaiLisible(quota.verdict.retryAfterSeconds)}.`,
    );
  }

  let sent = 0;
  let failed = 0;
  try {
    for (let index = 0; index < targets.length; index += LOT) {
      const lot = targets.slice(index, index + LOT);
      const envois = await Promise.all(
        lot.map((cible) =>
          creerEtEnvoyerLien(
            {
              id: cible.memberId,
              firstName: cible.firstName,
              lastName: cible.lastName,
              civility: cible.civility,
              email: cible.email as string,
              schoolYear: request.schoolYear,
              missing: cible.missing,
            },
            contexte,
            actor,
          ).catch((error): IssueEnvoi => {
            console.error(
              "[relances] échec d’un envoi :",
              redactError(error),
            );
            return { statut: "echec" };
          }),
        ),
      );
      // Un lien parti à l'instant par un envoi concurrent n'est ni un envoi
      // de plus ni un échec.
      for (const envoi of envois) {
        if (envoi.statut === "envoye") sent += 1;
        else if (envoi.statut === "echec") failed += 1;
      }
    }
  } finally {
    if (sent === 0) await quota.release();
  }

  // Les nombres seulement : ni noms ni adresses au journal.
  await recordAudit(actor, "adherent.relances", "association_member", null, {
    schoolYear: request.schoolYear,
    scope: request.scope,
    includeRecent: request.includeRecent,
    withMessage: Boolean(contexte.message),
    requested: targets.length,
    sent,
    failed,
    withoutEmail: withoutEmail.length,
    recent: recent.length,
  });

  return resultat(sent, failed);
}

// ---------------------------------------------------------------------------
// Relance d'une fiche
// ---------------------------------------------------------------------------

/**
 * Envoie le lien d'une seule fiche, depuis la fiche adhérent. Envoyé même si
 * rien d'obligatoire ne manque : le bureau peut vouloir faire vérifier une
 * adresse. Pas plus d'un lien toutes les dix minutes pour une même fiche.
 */
export async function sendSingleRelance(
  memberId: string,
  actor: AuditActor,
): Promise<MemberSingleRelanceResult> {
  if (!z.string().uuid().safeParse(memberId).success) {
    throw new HttpError(404, "Adhérent introuvable.");
  }
  const [membre] = await db
    .select()
    .from(associationMembers)
    .where(eq(associationMembers.id, memberId))
    .limit(1);
  if (!membre) throw new HttpError(404, "Adhérent introuvable.");
  if (membre.status === "inactive") {
    throw new HttpError(400, "Cette fiche est archivée : réactivez-la avant d’envoyer le lien.");
  }
  const email = emailValide(membre.email);
  if (!email) {
    throw new HttpError(
      400,
      "Cette fiche n’a pas d’adresse e-mail valable : contactez la famille autrement, ou ajoutez son adresse.",
    );
  }

  const contexte = await contexteEnvoi(null);

  const parCompte = await hitRateLimitStages([
    [[PLAFONDS.relanceCompte, actor.userId]],
  ]);
  if (!parCompte.verdict.ok) {
    await parCompte.release();
    throw rateLimitError(
      parCompte.verdict,
      `Vous avez déjà envoyé ${PLAFONDS.relanceCompte.limit} liens cette heure-ci : réessayez ${delaiLisible(parCompte.verdict.retryAfterSeconds)}.`,
    );
  }
  const parFiche = await hitRateLimitStages([
    [[PLAFONDS.relanceFiche, membre.id]],
  ]);
  const rendre = () => Promise.all([parCompte.release(), parFiche.release()]);
  const tropProche = (retryAfterSeconds: number) =>
    rateLimitError(
      { ok: false, count: 0, retryAfterSeconds },
      `Un lien vient de partir pour cette fiche : réessayez ${delaiLisible(retryAfterSeconds)}. Le lien déjà envoyé reste valable.`,
    );
  if (!parFiche.verdict.ok) {
    await rendre();
    throw tropProche(parFiche.verdict.retryAfterSeconds);
  }

  let issue: IssueEnvoi = { statut: "echec" };
  try {
    issue = await creerEtEnvoyerLien(
      {
        id: membre.id,
        firstName: membre.firstName,
        lastName: membre.lastName,
        civility: membre.civility,
        email,
        schoolYear: membre.schoolYear,
        missing: champsManquants(membre).missing,
      },
      contexte,
      actor,
    );
  } finally {
    if (issue.statut !== "envoye") await rendre();
  }
  if (issue.statut === "trop_proche") {
    throw tropProche(RELANCE_TROP_PROCHE_MS / 1000);
  }
  if (issue.statut === "echec") {
    throw new HttpError(
      502,
      "L’e-mail n’est pas parti : vérifiez la messagerie dans Configuration, puis réessayez. L’ancien lien reste valable.",
    );
  }
  const view = issue.view;

  await recordAudit(
    actor,
    "adherent.update_request",
    "association_member",
    membre.id,
    { requestId: view.id, expiresAt: view.expiresAt },
  );

  const [auteur] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return { request: { ...view, createdByName: auteur?.name ?? null } };
}

/** L'historique des liens d'une fiche, le plus récent d'abord. */
export async function listUpdateRequests(
  memberId: string,
): Promise<MemberUpdateRequestView[]> {
  if (!z.string().uuid().safeParse(memberId).success) return [];
  const lignes = await db
    .select({
      id: memberUpdateRequests.id,
      sentTo: memberUpdateRequests.sentTo,
      createdAt: memberUpdateRequests.createdAt,
      expiresAt: memberUpdateRequests.expiresAt,
      completedAt: memberUpdateRequests.completedAt,
      revokedAt: memberUpdateRequests.revokedAt,
      createdByName: users.name,
    })
    .from(memberUpdateRequests)
    .leftJoin(users, eq(users.id, memberUpdateRequests.createdBy))
    .where(eq(memberUpdateRequests.memberId, memberId))
    .orderBy(desc(memberUpdateRequests.createdAt))
    .limit(50);
  return lignes.map((ligne) => ({
    id: ligne.id,
    sentTo: ligne.sentTo,
    createdAt: ligne.createdAt.toISOString(),
    expiresAt: ligne.expiresAt.toISOString(),
    completedAt: instant(ligne.completedAt),
    revokedAt: instant(ligne.revokedAt),
    createdByName: ligne.createdByName ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Formulaire public
// ---------------------------------------------------------------------------

/** 32 octets en base64url : 43 caractères. Le reste n'est pas un de nos liens. */
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;

/**
 * La fiche liée à un lien encore valable, ou `null`. Une seule requête, par
 * l'empreinte : un lien expiré, révoqué, inconnu ou dont la fiche a été
 * archivée se lit de la même façon.
 */
async function lienValable(token: string) {
  if (typeof token !== "string" || !FORME_JETON.test(token)) return null;
  const [ligne] = await db
    .select({
      requestId: memberUpdateRequests.id,
      expiresAt: memberUpdateRequests.expiresAt,
      member: associationMembers,
    })
    .from(memberUpdateRequests)
    .innerJoin(
      associationMembers,
      eq(associationMembers.id, memberUpdateRequests.memberId),
    )
    .where(
      and(
        eq(memberUpdateRequests.tokenHash, hashToken(token)),
        isNull(memberUpdateRequests.revokedAt),
        gt(memberUpdateRequests.expiresAt, new Date()),
        ne(associationMembers.status, "inactive"),
      ),
    )
    .limit(1);
  return ligne ?? null;
}

/** Ce que voit la famille sur `/adhesion/[token]`, ou `null`. */
export async function getPublicMemberForm(
  token: string,
): Promise<PublicMemberForm | null> {
  const lien = await lienValable(token);
  if (!lien) return null;
  const { member } = lien;
  const settings = await getAssociationSettings();
  return {
    associationName: settings.associationName,
    schoolYear: member.schoolYear,
    firstName: member.firstName,
    lastName: member.lastName,
    civility: isCivility(member.civility) ? member.civility : null,
    email: member.email,
    phone: member.phone,
    streetNumber: member.streetNumber,
    addressLine1: member.addressLine1,
    addressLine2: member.addressLine2,
    locality: member.locality,
    postalCode: member.postalCode,
    city: member.city,
    country: member.country || "France",
    nationalFeeElsewhere: member.nationalFeeElsewhere,
    otherSchoolName: member.otherSchoolName,
    missing: champsManquants(member).missing,
    expiresAt: lien.expiresAt.toISOString(),
  };
}

const texteFacultatif = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => emptyToNull(value));

/**
 * Ce que la famille peut changer, et rien d'autre : `.strict()` refuse tout
 * champ en plus (statut, cotisation, nom…). Mêmes longueurs que la fiche
 * côté bureau (`associationMemberSchema`).
 */
export const publicMemberUpdateSchema = z
  .object({
    civility: z.enum(CIVILITIES, {
      errorMap: () => ({ message: "Choisissez une civilité." }),
    }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .nullable()
      .optional()
      .transform((value) => emptyToNull(value))
      .refine((value) => value === null || adresseEmail.safeParse(value).success, {
        message: "Adresse e-mail invalide.",
      }),
    phone: texteFacultatif(40),
    streetNumber: texteFacultatif(20),
    addressLine1: texteFacultatif(200),
    addressLine2: texteFacultatif(200),
    locality: texteFacultatif(120),
    postalCode: z.string().trim().min(1, "Indiquez le code postal.").max(20),
    city: z.string().trim().min(1, "Indiquez la ville.").max(120),
    country: z.string().trim().min(2, "Indiquez le pays.").max(120),
    nationalFeeElsewhere: z.boolean(),
    otherSchoolName: texteFacultatif(200),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.addressLine1 && !data.locality) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["addressLine1"],
        message: "Indiquez la voie, ou à défaut le lieu-dit.",
      });
    }
    if (isFrance(data.country) && !isFrenchPostalCode(data.postalCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postalCode"],
        message: "Le code postal compte cinq chiffres (ex. 85000).",
      });
    }
    if (data.nationalFeeElsewhere && !data.otherSchoolName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherSchoolName"],
        message: "Indiquez l’établissement où la part nationale est réglée.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    // « 85 000 » et « 85000 » : un seul code postal.
    postalCode: isFrance(data.country)
      ? data.postalCode.replace(/\s+/g, "")
      : data.postalCode,
    otherSchoolName: data.nationalFeeElsewhere ? data.otherSchoolName : null,
  })) satisfies z.ZodType<PublicMemberUpdateInput, z.ZodTypeDef, unknown>;

/** Les champs que la famille peut modifier, dans l'ordre de la fiche. */
const CHAMPS_PUBLICS = [
  "civility",
  "email",
  "phone",
  "streetNumber",
  "addressLine1",
  "addressLine2",
  "locality",
  "postalCode",
  "city",
  "country",
  "nationalFeeElsewhere",
  "otherSchoolName",
] as const satisfies ReadonlyArray<keyof PublicMemberUpdateInput>;

/**
 * Enregistre ce que la famille a saisi. Seuls les champs ci-dessus changent ;
 * la version de la fiche avance, pour qu'un administrateur qui l'a ouverte
 * entre-temps soit prévenu au lieu d'écraser la saisie. Le lien reste
 * valable jusqu'à son expiration : la famille peut corriger une faute de
 * frappe. Le journal note quels champs ont changé, jamais leurs valeurs.
 */
export async function submitPublicMemberUpdate(
  token: string,
  input: unknown,
  meta: { ipAddress?: string | null } = {},
): Promise<{ missing: MemberInfoField[] }> {
  const lien = await lienValable(token);
  if (!lien) throw new HttpError(404, MESSAGE_LIEN_INVALIDE);
  const data = publicMemberUpdateSchema.parse(input);
  const now = new Date();

  const membre = await db.transaction(async (tx) => {
    // Le lien est relu sous verrou : révoqué entre-temps par un nouvel envoi,
    // il ne doit plus rien écrire.
    const [request] = await tx
      .select({ id: memberUpdateRequests.id })
      .from(memberUpdateRequests)
      .where(
        and(
          eq(memberUpdateRequests.id, lien.requestId),
          isNull(memberUpdateRequests.revokedAt),
          gt(memberUpdateRequests.expiresAt, now),
        ),
      )
      .for("update");
    if (!request) throw new HttpError(404, MESSAGE_LIEN_INVALIDE);

    const [avant] = await tx
      .select()
      .from(associationMembers)
      .where(eq(associationMembers.id, lien.member.id))
      .for("update");
    if (!avant || avant.status === "inactive") {
      throw new HttpError(404, MESSAGE_LIEN_INVALIDE);
    }

    const changes = CHAMPS_PUBLICS.filter(
      (champ) => (avant[champ] ?? null) !== (data[champ] ?? null),
    );

    const [apres] = await tx
      .update(associationMembers)
      .set({
        civility: data.civility,
        email: data.email,
        phone: data.phone,
        streetNumber: data.streetNumber,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        locality: data.locality,
        postalCode: data.postalCode,
        city: data.city,
        country: data.country,
        nationalFeeElsewhere: data.nationalFeeElsewhere,
        otherSchoolName: data.otherSchoolName,
        version: sql`${associationMembers.version} + 1`,
        updatedAt: now,
      })
      .where(eq(associationMembers.id, avant.id))
      .returning();

    await tx
      .update(memberUpdateRequests)
      .set({
        completedAt: sql`coalesce(${memberUpdateRequests.completedAt}, ${now})`,
      })
      .where(eq(memberUpdateRequests.id, request.id));

    // Pas d'auteur : c'est la famille, par son lien. Les noms des champs
    // seulement, jamais ce qu'elle a écrit.
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "adherent.update",
      entityType: "association_member",
      entityId: avant.id,
      source: "web",
      ipAddress: meta.ipAddress ?? null,
      details: {
        source: "public_update_link",
        requestId: request.id,
        fields: changes,
      },
    });

    return apres;
  });

  return { missing: champsManquants(membre).missing };
}
