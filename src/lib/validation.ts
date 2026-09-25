import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-policy";
import { parseLocalDateTime } from "@/lib/dates";
import { agMinutesPayloadSchema } from "@/lib/documents/ag-validation";
import { ASSOCIATION_DOCUMENT_TYPES } from "@/lib/labels";
import { MONTANT_MAX_CENTIMES } from "@/lib/money";
import {
  checkTicketingUrl,
  TICKETING_KINDS,
  TICKETING_URL_MAX,
} from "@/lib/ticketing";
import { checkWhatsappUrl, WHATSAPP_URL_MAX } from "@/lib/whatsapp";
import {
  LEAD_TIME_MAX,
  type LeadTimeUnit,
} from "@/lib/task-lead-time";

/**
 * Champ <input type="datetime-local"> : chaîne « heure de Paris » convertie en
 * instant UTC. (z.coerce.date() interpréterait la chaîne dans le fuseau du
 * serveur — UTC sur Vercel — ce qui décalerait l'heure saisie.)
 */
const localDateTime = z.string().min(1, "Date requise").transform((value, ctx) => {
  const date = parseLocalDateTime(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide" });
    return z.NEVER;
  }
  return date;
});

/** Numéro de version pour le verrou optimiste (envoyé par le client à l'édition). */
const optimisticVersion = z.coerce.number().int().nonnegative().optional();

/**
 * Longueur d'un nouveau mot de passe. Le reste de la règle (mots de passe
 * courants, suites, adresse, nom de l'association) se vérifie dans la route,
 * avec `assertAcceptablePassword` : elle a besoin du contexte, et son refus
 * doit s'afficher tel quel plutôt qu'en « Données invalides ».
 */
const passwordField = (label = "Le mot de passe") =>
  z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `${label} doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`,
    )
    .max(PASSWORD_MAX_LENGTH);

/**
 * Nom d'une personne qui demande un compte.
 *
 * Les caractères de contrôle (retours à la ligne, tabulations…) et ceux qui
 * inversent le sens d'écriture sont refusés : ce nom part tel quel dans l'objet
 * et le corps de l'avis envoyé au bureau, depuis l'adresse de l'association.
 * Un retour à la ligne y faisait passer n'importe quel texte, et un inverseur
 * de sens permet d'afficher un nom autre que celui enregistré.
 */
const personName = z
  .string()
  .trim()
  .min(2, "Nom trop court")
  .max(120)
  .regex(
    /^[^\p{Cc}‪-‮⁦-⁩]+$/u,
    "Nom invalide : retirez les retours à la ligne et caractères invisibles.",
  );

/**
 * Inscription. Le mot de passe n'est lu que pour le tout premier compte, qui
 * entre tout de suite ; les suivants le choisissent en confirmant leur adresse
 * (voir `accountConfirmSchema`).
 */
export const registerSchema = z.object({
  name: personName,
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: passwordField().optional(),
  // Honeypot anti-robot : champ caché qui doit rester vide.
  website: z.string().optional(),
  /** Jeton reCAPTCHA v3, présent uniquement si la protection est activée. */
  recaptchaToken: z.string().max(5000).optional(),
});

/**
 * Confirmation d'une demande de compte, depuis le lien reçu par e-mail. Le mot
 * de passe se choisit ici, et pas à la demande : une demande déposée à
 * l'adresse d'un autre ne donne ainsi à son auteur aucun mot de passe valable.
 */
export const accountConfirmSchema = z.object({
  token: z.string().min(16).max(200),
  name: personName,
  password: passwordField(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
  // Pas de longueur minimale ici : un mot de passe choisi sous l'ancienne
  // règle (huit caractères) doit continuer d'ouvrir la session.
  password: z.string().min(1, "Mot de passe requis").max(PASSWORD_MAX_LENGTH),
});

export const eventSchema = z.object({
  /** « meeting » : réunion interne, jamais publiée sur le site public. */
  kind: z.enum(["event", "meeting"]).default("event"),
  title: z.string().trim().min(2, "Titre trop court").max(200),
  /** Réservé à l'équipe. Ce qui doit être lu par les visiteurs va dans `publicDescription`. */
  description: z.string().max(5000).optional(),
  publicDescription: z.string().max(5000).optional(),
  /** Lien de paiement en ligne : validé par la règle partagée avec le formulaire. */
  ticketingUrl: z
    .string()
    .max(TICKETING_URL_MAX)
    .optional()
    .nullable()
    .transform((valeur, ctx) => {
      const verdict = checkTicketingUrl(valeur);
      if (!verdict.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: verdict.message });
        return z.NEVER;
      }
      return verdict.url;
    }),
  /**
   * Usage du lien choisi à la main ; `null` (ou "") : automatique. "" est
   * accepté parce que c'est la valeur de l'option « Détecter automatiquement ».
   */
  ticketingKind: z.preprocess(
    (valeur) => (valeur === "" ? null : valeur),
    z.enum(TICKETING_KINDS).nullable().optional(),
  ),
  location: z.string().max(300).optional(),
  startAt: localDateTime,
  endAt: localDateTime.nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  version: optimisticVersion,
});

const leadTimeValueSchema = z.coerce
  .number()
  .int()
  .min(0, "La durée doit être positive")
  .max(365)
  .optional();
const leadTimeUnitSchema = z.enum(["days", "weeks", "months"]).optional();

function validateLeadTimeDuration(
  data: { leadTimeValue?: number; leadTimeUnit?: LeadTimeUnit },
  ctx: z.RefinementCtx,
) {
  if (
    data.leadTimeValue !== undefined &&
    data.leadTimeUnit !== undefined &&
    data.leadTimeValue > LEAD_TIME_MAX[data.leadTimeUnit]
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leadTimeValue"],
      message: `Durée maximale : ${LEAD_TIME_MAX[data.leadTimeUnit]}`,
    });
  }
}

export const taskSchema = z
  .object({
    title: z.string().trim().min(2, "Titre trop court").max(200),
    description: z.string().max(2000).optional(),
    leadTimeDays: z.coerce
      .number()
      .int()
      .min(0, "Doit être positif")
      .max(365)
      .default(7),
    leadTimeValue: leadTimeValueSchema,
    leadTimeUnit: leadTimeUnitSchema,
    assigneeIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine(validateLeadTimeDuration);

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
    leadTimeValue: leadTimeValueSchema,
    leadTimeUnit: leadTimeUnitSchema,
    status: z.enum(["todo", "in_progress", "done"]).optional(),
    assigneeIds: z.array(z.string().uuid()).optional(),
    version: optimisticVersion,
  })
  .superRefine(validateLeadTimeDuration);

export const slotSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(200),
  description: z.string().max(2000).optional(),
  capacity: z.coerce.number().int().min(1, "Au moins 1").max(1000).default(1),
  startAt: localDateTime.nullable().optional(),
  endAt: localDateTime.nullable().optional(),
});

/**
 * Les deux coordonnées d'une personne qui s'engage sur un rendez-vous.
 *
 * Les deux sont exigées, et chacune pour une raison distincte. L'e-mail porte
 * la confirmation, le rappel, et surtout le lien de désinscription : sans lui,
 * la personne n'a aucun moyen de se retirer seule, alors que la page
 * Confidentialité le lui promet. Le téléphone sert le jour même, quand il faut
 * joindre quelqu'un qui ne lira pas ses courriels avant le lendemain.
 *
 * Auparavant l'un des deux suffisait, et cela fabriquait deux silences : un
 * inscrit sans e-mail n'était jamais rappelé ni joignable par la diffusion, et
 * il ne pouvait pas se désinscrire.
 */
export const emailRequis = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "E-mail requis")
  .email("Adresse e-mail invalide")
  .max(200);

/**
 * On compte les chiffres plutôt que d'imposer un format : 06 12 34 56 78,
 * 0612345678 et +33 6 12 34 56 78 sont le même numéro, et refuser l'un des
 * trois ferait abandonner le formulaire. La fourchette 9–15 couvre le plan de
 * numérotation français comme la norme E.164.
 */
export const telephoneRequis = z
  .string()
  .trim()
  .min(1, "Téléphone requis")
  .max(40)
  .refine(
    (v) => {
      const chiffres = (v.match(/\d/g) ?? []).length;
      return chiffres >= 9 && chiffres <= 15;
    },
    "Numéro de téléphone incomplet",
  );

export const signupSchema = z.object({
  slotId: z.string().uuid("Créneau invalide"),
  name: z.string().trim().min(2, "Nom requis").max(120),
  email: emailRequis,
  phone: telephoneRequis,
  consent: z.boolean().refine((v) => v === true, {
    message: "Vous devez accepter la politique de confidentialité.",
  }),
  /** Jeton reCAPTCHA v3, présent uniquement si la protection est activée. */
  recaptchaToken: z.string().max(5000).optional(),
});

/**
 * Ce qui amène le visiteur. Des démarches distinctes, que la page
 * confondait : adhérer à l'association et donner un coup de main sur un
 * rendez-vous sont deux démarches indépendantes — on peut adhérer sans jamais
 * tenir un stand, et aider sans être adhérent. Le bureau ne répond pas la même
 * chose aux deux, d'où le recueil de l'intention.
 *
 * Le champ reste facultatif plutôt que muni d'une valeur par défaut : une
 * demande d'adhésion qui arriverait sans son intention doit se signaler comme
 * telle, pas se déguiser silencieusement en question.
 */
export const JOIN_INTENTIONS = [
  "adherer",
  "coup_de_main",
  "les_deux",
  "question",
] as const;

export type JoinIntention = (typeof JOIN_INTENTIONS)[number];

export const JOIN_INTENTION_LABELS: Record<JoinIntention, string> = {
  adherer: "Adhérer à l’association",
  coup_de_main: "Donner un coup de main",
  les_deux: "Adhérer et donner un coup de main",
  question: "Poser une question",
};

/** Message public envoyé depuis la page « Rejoindre l'association ». */
export const joinRequestSchema = z.object({
  intention: z.enum(JOIN_INTENTIONS).optional(),
  name: z.string().trim().min(2, "Votre nom est requis").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  phone: z.string().trim().max(40).optional(),
  message: z
    .string()
    .trim()
    .min(10, "Dites-nous en quelques mots ce qui vous intéresse")
    .max(4000),
  consent: z.boolean().refine((value) => value === true, {
    message: "Vous devez accepter la politique de confidentialité.",
  }),
  // Honeypot anti-robot : champ caché qui doit rester vide.
  website: z.string().optional(),
  /** Jeton reCAPTCHA v3, présent uniquement si la protection est activée. */
  recaptchaToken: z.string().max(5000).optional(),
});

/** Sujets proposés à un parent qui écrit à l'association. */
export const FAMILY_MESSAGE_TOPICS = [
  "enseignant",
  "classe",
  "periscolaire",
  "enfant",
  "autre",
] as const;

/**
 * Message d'une famille : un parent sollicite l'association pour être
 * accompagné dans une difficulté avec l'école. Rien n'est stocké en base — le
 * message part directement dans la boîte de l'association.
 */
export const familyMessageSchema = z.object({
  name: z.string().trim().min(2, "Votre nom est requis").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  phone: z.string().trim().max(40).optional(),
  /** Niveau ou classe concernée, jamais le nom de l'enfant. */
  schoolClass: z.string().trim().max(80).optional(),
  topic: z.enum(FAMILY_MESSAGE_TOPICS).default("autre"),
  message: z
    .string()
    .trim()
    .min(10, "Racontez-nous la situation en quelques mots")
    .max(4000),
  consent: z.boolean().refine((value) => value === true, {
    message: "Vous devez accepter la politique de confidentialité.",
  }),
  // Honeypot anti-robot : champ caché qui doit rester vide.
  website: z.string().optional(),
  /** Jeton reCAPTCHA v3, présent uniquement si la protection est activée. */
  recaptchaToken: z.string().max(5000).optional(),
});

/** Réponse d'un membre à une réunion. */
export const meetingAttendanceSchema = z.object({
  status: z.enum(["yes", "maybe", "no"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * Présence annoncée depuis la page publique d'une réunion, par un parent qui
 * n'a pas de compte. Mêmes coordonnées qu'une inscription bénévole : un nom,
 * et au moins un moyen de le joindre s'il faut prévenir d'un report.
 */
export const publicMeetingAttendanceSchema = z.object({
  status: z.enum(["yes", "maybe", "no"]),
  name: z.string().trim().min(2, "Nom requis").max(120),
  // Même exigence que pour une inscription bénévole, et pour les mêmes
  // raisons : une présence annoncée porte aussi un lien de retrait.
  email: emailRequis,
  phone: telephoneRequis,
  consent: z.boolean().refine((v) => v === true, {
    message: "Vous devez accepter la politique de confidentialité.",
  }),
  recaptchaToken: z.string().max(5000).optional(),
});

export const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
  // Pot de miel anti-robot : champ caché qui doit rester vide.
  website: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Lien invalide"),
  password: passwordField(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: passwordField("Le nouveau mot de passe"),
});

export const templateTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Intitulé requis").max(200),
    leadTimeDays: z.coerce
      .number()
      .int()
      .min(0, "Doit être positif")
      .max(365)
      .default(7),
    leadTimeValue: leadTimeValueSchema,
    leadTimeUnit: leadTimeUnitSchema,
    description: z.string().max(2000).optional(),
  })
  .superRefine(validateLeadTimeDuration);

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  description: z.string().max(1000).optional(),
  tasks: z
    .array(templateTaskSchema)
    .min(1, "Au moins une tâche")
    .max(100, "Trop de tâches (100 max)"),
  version: optimisticVersion,
});

export const messageSchema = z.object({
  subject: z.string().trim().min(2, "Objet requis").max(160),
  message: z.string().trim().min(2, "Message requis").max(5000),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "member"]).optional(),
  telegramChatId: z.string().trim().max(60).nullable().optional(),
});

const nullableUuid = z.string().uuid().nullable().optional();
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresse e-mail invalide")
  .nullable()
  .optional()
  .or(z.literal(""));
type UploadScope = "accounting" | "document" | "branding";

function storedFilePattern(scope: UploadScope) {
  return new RegExp(
    `^/api/uploads/${scope}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,139}$`,
  );
}

function optionalUrl(scope: UploadScope) {
  const stored = storedFilePattern(scope);
  return z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (value === "" || stored.test(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }, "Utilisez un fichier enregistré ou une URL HTTP(S) valide")
    .nullable()
    .optional()
    .or(z.literal(""));
}

/**
 * Fichier hébergé par l'application, sans URL externe autorisée. Le logo est
 * affiché sur les pages publiques : une adresse distante exposerait les
 * visiteurs à un tiers et échapperait aux règles de sécurité du site.
 */
function storedFileOnly(scope: UploadScope) {
  const stored = storedFilePattern(scope);
  return z
    .string()
    .trim()
    .max(2000)
    .refine(
      (value) => value === "" || stored.test(value),
      "Importez le fichier depuis cet écran.",
    )
    .nullable()
    .optional()
    .or(z.literal(""));
}

const schoolYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027")
  .refine((value) => {
    const [start, end] = value.split("-").map(Number);
    return end === start + 1;
  }, "Les deux années doivent être consécutives");

/**
 * L'annulation d'un événement.
 *
 * `annule: false` remet l'événement debout : une annulation se fait d'un clic
 * et peut se faire de travers, il faut pouvoir revenir. Le rétablissement
 * n'envoie aucun message — on ne réveille pas les inscrits pour une fausse
 * manœuvre corrigée dans la minute.
 */
export const eventCancelSchema = z.object({
  annule: z.boolean(),
  /** Le motif communiqué aux inscrits ; facultatif, et seulement à l'annulation. */
  raison: z.string().trim().max(500).optional(),
  version: optimisticVersion,
});

export const associationMemberSchema = z.object({
  userId: nullableUuid,
  firstName: z.string().trim().min(1, "Prénom requis").max(120),
  lastName: z.string().trim().min(1, "Nom requis").max(120),
  email: optionalEmail,
  phone: optionalText(40),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  postalCode: optionalText(20),
  city: optionalText(120),
  country: z.string().trim().min(2).max(120).default("France"),
  status: z.enum(["active", "pending", "inactive"]).default("pending"),
  schoolYear,
  membershipFeeCents: z.coerce
    .number()
    .int()
    .nonnegative("La cotisation ne peut pas être négative")
    .max(10_000_000)
    .default(0),
  /** Don facultatif versé en plus de la cotisation ; 0 quand il n'y en a pas. */
  donationCents: z.coerce
    .number()
    .int()
    .nonnegative("Le don ne peut pas être négatif")
    .max(10_000_000)
    .default(0),
  feePaidAt: localDateTime.nullable().optional(),
  feePaymentMethod: z
    .enum(["especes", "cheque", "virement", "helloasso", "autre"])
    .nullable()
    .optional(),
  joinedAt: localDateTime.optional(),
  notes: optionalText(10_000),
  version: optimisticVersion,
});

export const associationMemberUpdateSchema = associationMemberSchema.partial();

export const financialAccountSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(160),
  type: z.enum(["bank", "cash"]),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});

export const financialAccountUpdateSchema = financialAccountSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucune modification fournie",
  });

export const accountingCategorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(160),
  type: z.enum(["income", "expense"]),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});

export const accountingEntrySchema = z.object({
  type: z.enum(["income", "expense"]),
  status: z.enum(["draft", "posted"]).default("draft"),
  accountId: nullableUuid,
  categoryId: nullableUuid,
  eventId: nullableUuid,
  label: z.string().trim().min(1, "Libellé requis").max(300),
  amountCents: z.coerce
    .number()
    .int()
    .positive("Le montant doit être strictement positif")
    // Voir MONTANT_MAX_CENTIMES : au-delà d'un million d'euros, c'est une
    // faute de frappe, et l'ancien plafond (la limite d'un entier 32 bits)
    // laissait deux écritures suffire à faire déborder le grand livre.
    .max(
      MONTANT_MAX_CENTIMES,
      "Montant trop élevé : une écriture ne dépasse pas 1 000 000 €. Vérifiez la saisie.",
    ),
  occurredAt: localDateTime,
  counterparty: optionalText(300),
  paymentMethod: optionalText(80),
  reference: optionalText(160),
  notes: optionalText(10_000),
  attachmentUrl: optionalUrl("accounting"),
  version: optimisticVersion,
});

export const accountingEntryUpdateSchema = accountingEntrySchema.partial();

export const associationDocumentSchema = z.object({
  type: z.enum(ASSOCIATION_DOCUMENT_TYPES),
  status: z.enum(["draft", "final", "archived"]).default("draft"),
  title: z.string().trim().min(1, "Titre requis").max(300),
  documentDate: localDateTime,
  content: z.string().max(200_000).default(""),
  memberId: nullableUuid,
  fileUrl: optionalUrl("document"),
  /**
   * Procès-verbal d'assemblée rédigé section par section. Absent pour tous les
   * autres documents. `null` détache explicitement un PV de l'éditeur guidé et
   * rend la main au texte libre.
   */
  payload: agMinutesPayloadSchema.nullable().optional(),
  version: optimisticVersion,
});

export const associationDocumentUpdateSchema =
  associationDocumentSchema.partial();

/** Pièce jointe d'un événement : devis, affiche, attestation, plan de salle. */
export const eventAttachmentSchema = z.object({
  label: z.string().trim().min(1, "Nom requis").max(200),
  fileUrl: optionalUrl("document").refine(
    (value): value is string => Boolean(value),
    "Importez un fichier ou indiquez un lien.",
  ),
});

/**
 * Ce que couvre la cotisation. Relève des statuts, donc varie : tant que le
 * bureau n’a pas tranché, les pages publiques se taisent sur ce point plutôt
 * que de supposer la règle la plus répandue.
 */
/**
 * Quand l'adresse de contact est prévenue d'une inscription venue du site.
 * Le récapitulatif n'est pas qu'un confort : le palier gratuit de Resend
 * plafonne à 100 e-mails par jour, confirmations aux bénévoles comprises.
 */
export const SIGNUP_NOTICE_MODES = [
  "quotidien",
  "immediat",
  "aucun",
] as const;

export type SignupNoticeMode = (typeof SIGNUP_NOTICE_MODES)[number];

/** L'ordre est celui du menu : la valeur par défaut en tête. */
export const SIGNUP_NOTICE_MODE_LABELS: Record<SignupNoticeMode, string> = {
  quotidien: "Un récapitulatif par jour",
  immediat: "Un e-mail à chaque inscription",
  aucun: "Aucun avis",
};

/**
 * Ce que chaque mode envoie vraiment à l'adresse de contact, dit là où l'on
 * choisit. Le récapitulatif ne porte pas que les inscriptions : quitter ce
 * mode, c'est aussi renoncer au point quotidien sur les tâches et au bilan
 * des demandes de compte refusées, et le réglage doit le dire avant, pas
 * après.
 *
 * Les comptes en attente de validation échappent à ce choix (voir
 * `remindBureauOfPendingAccounts`) : le formulaire le dit à part.
 */
export const SIGNUP_NOTICE_MODE_HINTS: Record<SignupNoticeMode, string> = {
  quotidien:
    "Un seul message par jour, avec les autres tâches planifiées : nouvelles inscriptions et réponses aux réunions, tâches en retard ou à venir, comptes à valider et demandes de compte refusées.",
  immediat:
    "Un message à chaque inscription de bénévole, à chaque réponse à une réunion et à chaque compte à valider — ces derniers se suspendent quand les demandes affluent. Pas de récapitulatif : le point sur les tâches et les demandes de compte refusées se suivent dans l’application.",
  aucun:
    "Aucun message pour les inscriptions ni pour les réponses aux réunions, et pas de récapitulatif : tout se suit dans l’application.",
};

export const MEMBERSHIP_FEE_BASES = ["famille", "enfant", "non_precise"] as const;

export type MembershipFeeBasis = (typeof MEMBERSHIP_FEE_BASES)[number];

/** Ce qui s’écrit à la suite d’un montant : « 18 € par famille ». */
export const MEMBERSHIP_FEE_BASIS_SUFFIX: Record<MembershipFeeBasis, string> = {
  famille: "par famille",
  enfant: "par enfant",
  non_precise: "",
};

const MEMBERSHIP_FEE_BASIS_SCHEMA = z
  .enum(MEMBERSHIP_FEE_BASES)
  .default("non_precise");

export const associationSettingsSchema = z.object({
  associationName: z.string().trim().min(2).max(160),
  schoolName: z.string().trim().min(2).max(200),
  contactEmail: optionalEmail,
  logoUrl: storedFileOnly("branding"),
  rna: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^W\d{9}$/, "Numéro RNA invalide (format attendu : W123456789)"),
  /**
   * Siège social déclaré en préfecture, repris tel quel sur les documents
   * officiels. Facultatif ici, signalé là où il manque : bloquer l'écran de
   * configuration sur une adresse que l'administrateur n'a pas sous la main
   * l'empêcherait d'enregistrer le reste.
   */
  headquarters: z.string().trim().max(300).default(""),
  /**
   * Cotisation annuelle affichée, en centimes. `null` vaut « non publiée » et
   * non « gratuite » : la page publique renvoie alors au bureau au lieu
   * d’annoncer un tarif. Le plafond à 1 000 € n’est pas une doctrine, c’est un
   * garde-fou contre la saisie en centimes d’un montant en euros.
   */
  membershipFeeCents: z.coerce
    .number()
    .int()
    .min(0)
    .max(
      100_000,
      "Montant improbable : le réglage attend des euros, pas des centimes.",
    )
    .nullable()
    .default(null),
  membershipFeeBasis: MEMBERSHIP_FEE_BASIS_SCHEMA,
  /** La marche à suivre pour régler, en une phrase écrite par le bureau. */
  membershipFeeNote: z.string().trim().max(300).default(""),
  signupNoticeMode: z.enum(SIGNUP_NOTICE_MODES).default("quotidien"),
  taskReminderWindowDays: z.coerce.number().int().min(0).max(30),
  volunteerReminderWindowDays: z.coerce.number().int().min(0).max(30),
  telegramEnabled: z.boolean().default(false),
  telegramBotToken: z
    .string()
    .trim()
    .min(20)
    .max(500)
    .optional()
    .or(z.literal("")),
  clearTelegramBotToken: z.boolean().default(false),
  recaptchaEnabled: z.boolean().default(false),
  recaptchaSiteKey: optionalText(200),
  recaptchaSecret: z.string().trim().min(10).max(500).optional().or(z.literal("")),
  clearRecaptchaSecret: z.boolean().default(false),
  /** Note minimale acceptée, en pourcentage : Google note de 0 à 1. */
  recaptchaMinScore: z.coerce.number().int().min(0).max(100).default(50),
  /** Lien d'invitation du groupe WhatsApp, publié tel quel sur le site. */
  whatsappGroupUrl: z
    .string()
    .max(WHATSAPP_URL_MAX)
    .optional()
    .nullable()
    .transform((valeur, ctx) => {
      const verdict = checkWhatsappUrl(valeur);
      if (!verdict.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: verdict.message });
        return z.NEVER;
      }
      return verdict.url;
    }),
});

/**
 * Entrée sûre pour la messagerie. Les secrets bruts ne transitent qu'au
 * moment de leur remplacement et sont chiffrés par le service avant stockage.
 */
export const outboundMailSettingsSchema = z.object({
  provider: z.enum(["resend", "smtp"]).default("resend"),
  enabled: z.boolean().default(false),
  fromName: optionalText(160),
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
  domain: optionalText(253),
  apiKey: z.string().trim().min(8).max(500).optional().or(z.literal("")),
  clearApiKey: z.boolean().default(false),
  smtpHost: optionalText(253),
  smtpPort: z
    .union([
      z.coerce.number().int().min(1).max(65_535),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  smtpSecure: z.boolean().default(false),
  smtpUsername: optionalText(320),
  // Ne pas appliquer trim() : les espaces peuvent faire partie du secret.
  smtpPassword: z.string().min(1).max(1_000).optional().or(z.literal("")),
  clearSmtpPassword: z.boolean().default(false),
});

export const oauthClientSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9._~-]+$/, "Identifiant client invalide"),
  name: z.string().trim().min(1).max(200),
  clientSecretHash: z.string().min(20).max(500).nullable().optional(),
  redirectUris: z.array(z.string().url()).min(1).max(20),
  tokenEndpointAuthMethod: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .default("none"),
  grantTypes: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .max(2)
    .default(["authorization_code", "refresh_token"]),
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  enabled: z.boolean().default(true),
});

export const oauthAuthorizationCodeSchema = z.object({
  codeHash: z.string().min(20).max(500),
  oauthClientId: z.string().uuid(),
  userId: z.string().uuid(),
  redirectUri: z.string().url(),
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal("S256").default("S256"),
  expiresAt: z.coerce.date(),
});

export const oauthTokenSchema = z.object({
  tokenHash: z.string().min(20).max(500),
  type: z.enum(["access", "refresh"]),
  oauthClientId: z.string().uuid(),
  userId: z.string().uuid(),
  authorizationCodeId: nullableUuid,
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  expiresAt: z.coerce.date(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type SlotInput = z.infer<typeof slotSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type AssociationMemberInput = z.infer<typeof associationMemberSchema>;
export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;
export type AccountingCategoryInput = z.infer<typeof accountingCategorySchema>;
export type AccountingEntryInput = z.infer<typeof accountingEntrySchema>;
export type AssociationDocumentInput = z.infer<
  typeof associationDocumentSchema
>;
export type AssociationSettingsInput = z.infer<
  typeof associationSettingsSchema
>;
export type OutboundMailSettingsInput = z.infer<
  typeof outboundMailSettingsSchema
>;
export type OAuthClientInput = z.infer<typeof oauthClientSchema>;
export type OAuthAuthorizationCodeInput = z.infer<
  typeof oauthAuthorizationCodeSchema
>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;


/**
 * Le rapprochement des cotisations avec la comptabilité.
 *
 * Les parts se posent en bloc : l'écran d'affectation montre la répartition
 * entière d'une écriture, et une liste vide détache tout. Le plafond de 500
 * lignes couvre l'année d'une grosse école en un seul virement HelloAsso, sans
 * laisser passer une requête déraisonnable.
 */
export const cotisationAffectationsSchema = z.object({
  affectations: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        amountCents: z.coerce.number().int().positive().max(10_000_000),
      }),
    )
    .max(500)
    .default([])
    .superRefine((liste, ctx) => {
      const vus = new Set<string>();
      for (const part of liste) {
        if (vus.has(part.memberId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Un adhérent ne peut apparaître deux fois sur la même écriture.",
          });
          return;
        }
        vus.add(part.memberId);
      }
    }),
});

/** Reprise des adhésions encaissées avant la mise en service du rapprochement. */
export const cotisationRattrapageSchema = z.object({
  schoolYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Année scolaire invalide"),
  /**
   * « groupée » : une seule écriture pour tout le lot, la forme d'un
   * reversement HelloAsso ou d'une remise de chèques.
   * « par_adherent » : une écriture chacun, datée du règlement porté sur la
   * fiche.
   */
  mode: z.enum(["groupee", "par_adherent"]).default("groupee"),
  accountId: z.string().uuid("Choisissez un compte de trésorerie"),
  categoryId: z.string().uuid("Choisissez une catégorie de recettes"),
  /**
   * Où ranger les dons versés en plus des cotisations. Un don n'est pas une
   * cotisation — il se suit à part, et peut ouvrir droit à un reçu fiscal —,
   * il part donc dans sa propre écriture. Facultatif tant que le lot n'en
   * contient aucun ; le service refuse le lot sinon.
   */
  donationCategoryId: z
    .string()
    .uuid("Choisissez une catégorie de dons")
    .nullable()
    .optional(),
  label: z.string().trim().min(2).max(200),
  occurredAt: z.coerce.date(),
  counterparty: optionalText(200),
  paymentMethod: optionalText(80),
  /** Restreint la reprise à une sélection ; absent, elle prend tout le lot. */
  memberIds: z.array(z.string().uuid()).max(2000).optional(),
});
