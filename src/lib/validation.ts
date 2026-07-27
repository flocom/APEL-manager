import { z } from "zod";

import { parseLocalDateTime } from "@/lib/dates";
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

/** Règle commune de mot de passe (≥ 8 caractères). */
const passwordField = (label = "Le mot de passe") =>
  z
    .string()
    .min(8, `${label} doit faire au moins 8 caractères`)
    .max(200);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: passwordField(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const eventSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(200),
  description: z.string().max(5000).optional(),
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

export const signupSchema = z.object({
  slotId: z.string().uuid("Créneau invalide"),
  name: z.string().trim().min(2, "Nom requis").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Adresse e-mail invalide")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  consent: z.boolean().refine((v) => v === true, {
    message: "Vous devez accepter la politique de confidentialité.",
  }),
});

export const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
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
function optionalUrl(scope: "accounting" | "document") {
  const storedFilePattern = new RegExp(
    `^/api/uploads/${scope}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,139}$`,
  );
  return z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (value === "" || storedFilePattern.test(value)) return true;
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

const schoolYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027")
  .refine((value) => {
    const [start, end] = value.split("-").map(Number);
    return end === start + 1;
  }, "Les deux années doivent être consécutives");

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
  feePaidAt: localDateTime.nullable().optional(),
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

export const financialAccountUpdateSchema = financialAccountSchema.partial();

export const accountingCategorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(160),
  type: z.enum(["income", "expense"]),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});

export const accountingCategoryUpdateSchema =
  accountingCategorySchema.partial();

export const accountingEntrySchema = z.object({
  type: z.enum(["income", "expense"]),
  status: z.enum(["draft", "posted"]).default("draft"),
  accountId: nullableUuid,
  categoryId: nullableUuid,
  label: z.string().trim().min(1, "Libellé requis").max(300),
  amountCents: z.coerce
    .number()
    .int()
    .positive("Le montant doit être strictement positif")
    .max(2_000_000_000),
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
  type: z.enum(["ag_minutes", "attestation", "other"]),
  status: z.enum(["draft", "final", "archived"]).default("draft"),
  title: z.string().trim().min(1, "Titre requis").max(300),
  documentDate: localDateTime,
  content: z.string().max(200_000).default(""),
  memberId: nullableUuid,
  fileUrl: optionalUrl("document"),
  version: optimisticVersion,
});

export const associationDocumentUpdateSchema =
  associationDocumentSchema.partial();

/**
 * Schéma d'entrée sûr pour les réglages : `apiKey` est le secret brut reçu
 * ponctuellement. Le service devra le chiffrer avant de remplir
 * `encryptedApiKey`; cette dernière valeur ne doit jamais sortir de l'API.
 */
export const outboundMailSettingsSchema = z.object({
  provider: z.literal("resend").default("resend"),
  enabled: z.boolean().default(false),
  fromName: optionalText(160),
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
  domain: optionalText(253),
  apiKey: z.string().trim().min(8).max(500).optional().or(z.literal("")),
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

export const auditLogSchema = z.object({
  actorUserId: nullableUuid,
  oauthClientId: z.string().uuid().nullable().optional(),
  action: z.string().trim().min(1).max(160),
  entityType: z.string().trim().min(1).max(160),
  entityId: optionalText(200),
  source: z.string().trim().min(1).max(80).default("web"),
  ipAddress: optionalText(80),
  details: z.record(z.unknown()).default({}),
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
export type OutboundMailSettingsInput = z.infer<
  typeof outboundMailSettingsSchema
>;
export type OAuthClientInput = z.infer<typeof oauthClientSchema>;
export type OAuthAuthorizationCodeInput = z.infer<
  typeof oauthAuthorizationCodeSchema
>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;
export type AuditLogInput = z.infer<typeof auditLogSchema>;
