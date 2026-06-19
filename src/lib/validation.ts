import { z } from "zod";

import { parseLocalDateTime } from "@/lib/dates";

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

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères")
    .max(200),
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
});

export const taskSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(200),
  description: z.string().max(2000).optional(),
  leadTimeDays: z.coerce
    .number()
    .int()
    .min(0, "Doit être positif")
    .max(365)
    .default(7),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

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
});

export const templateTaskSchema = z.object({
  title: z.string().trim().min(1, "Intitulé requis").max(200),
  leadTimeDays: z.coerce.number().int().min(0, "Doit être positif").max(365),
  description: z.string().max(2000).optional(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  description: z.string().max(1000).optional(),
  tasks: z
    .array(templateTaskSchema)
    .min(1, "Au moins une tâche")
    .max(100, "Trop de tâches (100 max)"),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "member"]).optional(),
  telegramChatId: z.string().trim().max(60).nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type SlotInput = z.infer<typeof slotSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
