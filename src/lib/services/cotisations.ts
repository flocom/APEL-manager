import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  associationMembers,
  financialAccounts,
  membershipPayments,
} from "@/lib/db/schema";
import {
  cotisationAffectationsSchema,
  cotisationRattrapageSchema,
} from "@/lib/validation";

import {
  PAYMENT_METHODS_DIRECTS,
  type PaymentMethod,
} from "@/lib/labels";

import { recordAudit, type AuditActor } from "./audit";

/**
 * Le rapprochement des cotisations avec la comptabilité.
 *
 * Jusqu'ici, encaisser une cotisation dans l'onglet Adhérents ne créait aucune
 * écriture : la principale recette récurrente de l'association manquait au
 * résultat, ou bien le trésorier la ressaisissait à la main — et les deux
 * tables divergeaient dès la première correction.
 *
 * Le rapprochement se fait par parts : une écriture couvre N adhérents, chacun
 * pour son montant. C'est le cas courant et non l'exception, puisqu'un
 * reversement HelloAsso arrive en un seul virement groupé, comme une remise de
 * chèques en banque.
 *
 * Deux règles tiennent l'ensemble :
 *  — on n'affecte que des recettes (`income`) ;
 *  — la somme des parts ne dépasse jamais le montant de l'écriture, mais peut
 *    rester en deçà : un même virement peut porter des cotisations, des billets
 *    et un don, et seule la part « cotisations » se rattache ici.
 */

export interface LigneRapprochement {
  memberId: string;
  nom: string;
  schoolYear: string;
  statut: "active" | "pending" | "inactive";
  /** Ce que la famille doit, tel qu'enregistré sur sa fiche. */
  duCents: number;
  /** Ce qui est marqué réglé sur la fiche, sans préjuger de la comptabilité. */
  regleLe: Date | null;
  /** Comment la famille a réglé : décide si l'argent est déjà sur un compte. */
  mode: PaymentMethod | null;
  /** Ce qui est réellement rattaché à une écriture comptable. */
  comptabiliseCents: number;
  /** Les écritures qui le portent, pour pouvoir y retourner. */
  ecritures: { id: string; label: string; occurredAt: Date; partCents: number }[];
}

export type EtatRapprochement =
  /** Réglée sur la fiche et présente dans les comptes, pour le même montant. */
  | "rapprochee"
  /** Réglée sur la fiche, absente des comptes : c'est ce que le rattrapage vise. */
  | "manquante"
  /**
   * Réglée par une plateforme, pas encore dans les comptes — et c'est normal :
   * l'argent n'est pas encore arrivé sur le compte de l'association. Il viendra
   * en un versement groupé, qu'on pointera alors. Ce n'est pas un retard, et le
   * rattrapage doit s'en abstenir sous peine de créer une recette fantôme puis
   * un doublon le jour du versement.
   */
  | "attente_versement"
  /** Dans les comptes pour un montant différent de ce que dit la fiche. */
  | "ecart"
  /** Ni réglée, ni comptabilisée : il n'y a rien à rapprocher. */
  | "attendue"
  /** Comptabilisée alors que la fiche ne la dit pas réglée. */
  | "non_pointee";

export function etatDe(ligne: LigneRapprochement): EtatRapprochement {
  const regle = ligne.regleLe !== null;
  if (ligne.comptabiliseCents === 0) {
    if (!regle) return "attendue";
    return PAYMENT_METHODS_DIRECTS.includes(ligne.mode ?? "autre")
      ? "manquante"
      : "attente_versement";
  }
  if (!regle) return "non_pointee";
  return ligne.comptabiliseCents === ligne.duCents ? "rapprochee" : "ecart";
}

/** Les années scolaires présentes chez les adhérents, la plus récente d'abord. */
export async function anneesScolaires(): Promise<string[]> {
  const lignes = await db
    .selectDistinct({ schoolYear: associationMembers.schoolYear })
    .from(associationMembers)
    .orderBy(desc(associationMembers.schoolYear));
  return lignes.map((l) => l.schoolYear);
}

/**
 * L'état de chaque adhésion, pour une année scolaire ou pour toutes.
 *
 * `null` demande toutes les années : l'écran Adhérents affiche une seule liste
 * pour toutes les années, chaque fiche portant son propre état comptable, et
 * ne peut donc pas se limiter à l'une d'elles.
 */
export async function rapprochement(schoolYear: string | null) {
  const membres = await db
    .select({
      id: associationMembers.id,
      firstName: associationMembers.firstName,
      lastName: associationMembers.lastName,
      schoolYear: associationMembers.schoolYear,
      status: associationMembers.status,
      membershipFeeCents: associationMembers.membershipFeeCents,
      feePaidAt: associationMembers.feePaidAt,
      feePaymentMethod: associationMembers.feePaymentMethod,
    })
    .from(associationMembers)
    .where(
      schoolYear === null
        ? undefined
        : eq(associationMembers.schoolYear, schoolYear),
    )
    .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName));

  if (membres.length === 0) return [] as LigneRapprochement[];

  const parts = await db
    .select({
      memberId: membershipPayments.memberId,
      amountCents: membershipPayments.amountCents,
      entryId: accountingEntries.id,
      label: accountingEntries.label,
      occurredAt: accountingEntries.occurredAt,
    })
    .from(membershipPayments)
    .innerJoin(
      accountingEntries,
      eq(membershipPayments.entryId, accountingEntries.id),
    )
    .where(
      inArray(
        membershipPayments.memberId,
        membres.map((m) => m.id),
      ),
    );

  const parMembre = new Map<string, LigneRapprochement["ecritures"]>();
  for (const part of parts) {
    const liste = parMembre.get(part.memberId) ?? [];
    liste.push({
      id: part.entryId,
      label: part.label,
      occurredAt: part.occurredAt,
      partCents: part.amountCents,
    });
    parMembre.set(part.memberId, liste);
  }

  return membres.map<LigneRapprochement>((membre) => {
    const ecritures = parMembre.get(membre.id) ?? [];
    return {
      memberId: membre.id,
      nom: `${membre.firstName} ${membre.lastName}`.trim(),
      schoolYear: membre.schoolYear,
      statut: membre.status,
      duCents: membre.membershipFeeCents,
      regleLe: membre.feePaidAt,
      mode: membre.feePaymentMethod,
      comptabiliseCents: ecritures.reduce((t, e) => t + e.partCents, 0),
      ecritures,
    };
  });
}

/** Les totaux que lit le trésorier : ce qui est dû, encaissé, et comptabilisé. */
export function totaux(lignes: LigneRapprochement[]) {
  const attendu = lignes.reduce((t, l) => t + l.duCents, 0);
  const encaisse = lignes
    .filter((l) => l.regleLe !== null)
    .reduce((t, l) => t + l.duCents, 0);
  const comptabilise = lignes.reduce((t, l) => t + l.comptabiliseCents, 0);
  const manquantes = lignes.filter((l) => etatDe(l) === "manquante");
  const enAttente = lignes.filter((l) => etatDe(l) === "attente_versement");
  return {
    attendu,
    encaisse,
    comptabilise,
    /** Ce que le rattrapage porterait aux comptes s'il tournait maintenant. */
    aRattraperCents: manquantes.reduce((t, l) => t + l.duCents, 0),
    aRattraperCount: manquantes.length,
    /** Encaissé par une plateforme, en attente du versement sur le compte. */
    attenteVersementCents: enAttente.reduce((t, l) => t + l.duCents, 0),
    attenteVersementCount: enAttente.length,
    ecartCount: lignes.filter((l) => etatDe(l) === "ecart").length,
    nonPointeesCount: lignes.filter((l) => etatDe(l) === "non_pointee").length,
  };
}

/** Ce qu'une écriture couvre déjà, pour l'écran d'affectation. */
export async function affectationsDeLEcriture(entryId: string) {
  return db
    .select({
      memberId: membershipPayments.memberId,
      amountCents: membershipPayments.amountCents,
      firstName: associationMembers.firstName,
      lastName: associationMembers.lastName,
      schoolYear: associationMembers.schoolYear,
    })
    .from(membershipPayments)
    .innerJoin(
      associationMembers,
      eq(membershipPayments.memberId, associationMembers.id),
    )
    .where(eq(membershipPayments.entryId, entryId))
    .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName));
}

/**
 * Remplace en bloc ce qu'une écriture couvre.
 *
 * En bloc, et non ligne à ligne, parce que l'écran d'affectation présente la
 * répartition entière : un envoi partiel laisserait des parts orphelines si le
 * navigateur se ferme au milieu. Une liste vide détache tout.
 */
export async function affecterCotisations(
  entryId: string,
  input: unknown,
  actor: AuditActor,
) {
  const { affectations } = cotisationAffectationsSchema.parse(input);

  const [entry] = await db
    .select({
      id: accountingEntries.id,
      type: accountingEntries.type,
      amountCents: accountingEntries.amountCents,
      label: accountingEntries.label,
    })
    .from(accountingEntries)
    .where(eq(accountingEntries.id, entryId))
    .limit(1);
  if (!entry) throw new HttpError(404, "Écriture comptable introuvable.");
  if (entry.type !== "income") {
    throw new HttpError(
      400,
      "Seule une recette peut couvrir des cotisations.",
    );
  }

  const total = affectations.reduce((t, a) => t + a.amountCents, 0);
  if (total > entry.amountCents) {
    throw new HttpError(
      400,
      `Les parts affectées totalisent ${(total / 100).toFixed(2)} € pour une écriture de ${(entry.amountCents / 100).toFixed(2)} €.`,
    );
  }

  if (affectations.length > 0) {
    const ids = affectations.map((a) => a.memberId);
    const connus = await db
      .select({ id: associationMembers.id })
      .from(associationMembers)
      .where(inArray(associationMembers.id, ids));
    if (connus.length !== new Set(ids).size) {
      throw new HttpError(400, "Un des adhérents sélectionnés est introuvable.");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(membershipPayments)
      .where(eq(membershipPayments.entryId, entryId));
    if (affectations.length > 0) {
      await tx.insert(membershipPayments).values(
        affectations.map((a) => ({
          entryId,
          memberId: a.memberId,
          amountCents: a.amountCents,
          createdBy: actor.userId,
        })),
      );
    }
  });

  await recordAudit(
    actor,
    "accounting.membership_link",
    "accounting_entry",
    entryId,
    { adherents: affectations.length, totalCents: total },
  );

  return affectationsDeLEcriture(entryId);
}

/** Les adhésions réglées sur leur fiche mais absentes des comptes. */
export async function cotisationsARattraper(schoolYear: string) {
  return (await rapprochement(schoolYear)).filter(
    (ligne) => etatDe(ligne) === "manquante" && ligne.duCents > 0,
  );
}

/**
 * Porte aux comptes les adhésions déjà encaissées mais jamais écrites.
 *
 * Sans cette reprise, la comptabilité démarrerait avec un trou sur l'année en
 * cours : toutes les cotisations réglées avant la mise en service resteraient
 * invisibles au résultat. Elle ne touche jamais les fiches des adhérents — elle
 * n'écrit que dans la comptabilité, et tout est rattachable, donc défaisable.
 *
 * Deux formes, parce que les deux existent en vrai : une écriture par adhérent
 * quand chacun a remis son chèque, une écriture groupée quand l'argent est
 * arrivé en un seul virement — le cas HelloAsso.
 */
export async function rattraperCotisations(input: unknown, actor: AuditActor) {
  const data = cotisationRattrapageSchema.parse(input);

  const [compte] = await db
    .select({ id: financialAccounts.id, isActive: financialAccounts.isActive })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, data.accountId))
    .limit(1);
  if (!compte || !compte.isActive) {
    throw new HttpError(400, "Compte de trésorerie invalide ou inactif.");
  }

  const [categorie] = await db
    .select({
      id: accountingCategories.id,
      type: accountingCategories.type,
      isActive: accountingCategories.isActive,
    })
    .from(accountingCategories)
    .where(eq(accountingCategories.id, data.categoryId))
    .limit(1);
  if (!categorie || !categorie.isActive || categorie.type !== "income") {
    throw new HttpError(
      400,
      "La catégorie doit être une catégorie de recettes active.",
    );
  }

  const candidates = await cotisationsARattraper(data.schoolYear);
  const retenus =
    data.memberIds === undefined
      ? candidates
      : candidates.filter((c) => data.memberIds!.includes(c.memberId));

  if (retenus.length === 0) {
    throw new HttpError(
      400,
      "Aucune adhésion à rattraper : tout ce qui est réglé est déjà dans les comptes.",
    );
  }

  const total = retenus.reduce((t, l) => t + l.duCents, 0);

  const creees = await db.transaction(async (tx) => {
    const ecritures: { id: string; amountCents: number }[] = [];

    if (data.mode === "groupee") {
      const [entry] = await tx
        .insert(accountingEntries)
        .values({
          type: "income",
          // Brouillon : le trésorier relit et valide. Une reprise de masse qui
          // s'écrirait directement en comptabilité validée serait immuable, donc
          // irrattrapable en cas d'erreur de sélection.
          status: "draft",
          accountId: data.accountId,
          categoryId: data.categoryId,
          label: data.label,
          amountCents: total,
          occurredAt: data.occurredAt,
          counterparty: data.counterparty ?? null,
          paymentMethod: data.paymentMethod ?? null,
          notes: `Reprise de ${retenus.length} cotisation${retenus.length > 1 ? "s" : ""} — année scolaire ${data.schoolYear}.`,
          createdBy: actor.userId,
        })
        .returning({ id: accountingEntries.id });
      await tx.insert(membershipPayments).values(
        retenus.map((l) => ({
          entryId: entry.id,
          memberId: l.memberId,
          amountCents: l.duCents,
          createdBy: actor.userId,
        })),
      );
      ecritures.push({ id: entry.id, amountCents: total });
    } else {
      for (const ligne of retenus) {
        const [entry] = await tx
          .insert(accountingEntries)
          .values({
            type: "income",
            status: "draft",
            accountId: data.accountId,
            categoryId: data.categoryId,
            label: `${data.label} — ${ligne.nom}`,
            amountCents: ligne.duCents,
            // La date de règlement portée sur la fiche, quand elle existe :
            // une reprise qui daterait tout d'aujourd'hui fausserait l'exercice.
            occurredAt: ligne.regleLe ?? data.occurredAt,
            counterparty: data.counterparty ?? ligne.nom,
            paymentMethod: data.paymentMethod ?? null,
            createdBy: actor.userId,
          })
          .returning({ id: accountingEntries.id });
        await tx.insert(membershipPayments).values({
          entryId: entry.id,
          memberId: ligne.memberId,
          amountCents: ligne.duCents,
          createdBy: actor.userId,
        });
        ecritures.push({ id: entry.id, amountCents: ligne.duCents });
      }
    }

    return ecritures;
  });

  await recordAudit(
    actor,
    "accounting.membership_backfill",
    "accounting_entry",
    creees[0]?.id ?? null,
    {
      schoolYear: data.schoolYear,
      mode: data.mode,
      adherents: retenus.length,
      ecritures: creees.length,
      totalCents: total,
    },
  );

  return { ecritures: creees.length, adherents: retenus.length, totalCents: total };
}

/**
 * Ce que la comptabilité a enregistré en cotisations sur une année scolaire,
 * validé seulement : c'est le chiffre qui a sa place dans un rapport financier.
 */
export async function totalComptabilise(schoolYear: string) {
  const [ligne] = await db
    .select({
      total: sql<number>`coalesce(sum(${membershipPayments.amountCents}), 0)::int`,
    })
    .from(membershipPayments)
    .innerJoin(
      associationMembers,
      eq(membershipPayments.memberId, associationMembers.id),
    )
    .innerJoin(
      accountingEntries,
      eq(membershipPayments.entryId, accountingEntries.id),
    )
    .where(
      and(
        eq(associationMembers.schoolYear, schoolYear),
        eq(accountingEntries.status, "posted"),
        isNotNull(accountingEntries.id),
      ),
    );
  return Number(ligne?.total ?? 0);
}
