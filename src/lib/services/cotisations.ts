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
import { centimesDepuisSql, MONTANT_MAX_CENTIMES } from "@/lib/money";

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
 *
 * Le don qu'une famille ajoute à son adhésion fait partie de ce qu'elle doit :
 * le formulaire d'adhésion encaisse les deux ensemble, et le reversement les
 * porte en une seule somme. Le rapprochement compare donc le total, cotisation
 * et don ; seule la reprise les sépare, parce qu'elle crée elle-même les
 * écritures et qu'un don se range dans sa propre catégorie.
 */

export interface LigneRapprochement {
  memberId: string;
  nom: string;
  schoolYear: string;
  statut: "active" | "pending" | "inactive";
  /**
   * Ce que la famille doit, tel qu'enregistré sur sa fiche : la cotisation et
   * le don éventuel, puisqu'un encaissement groupé couvre les deux d'un bloc.
   */
  duCents: number;
  /** La part cotisation de `duCents`. */
  cotisationCents: number;
  /** La part don de `duCents` ; 0 quand la famille n'a rien ajouté. */
  donCents: number;
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

/** `db`, ou la transaction en cours : seule la lecture sert ici. */
type Lecteur = Pick<typeof db, "select">;

/**
 * Met en file les écritures qui rattachent des cotisations.
 *
 * Le rattrapage calcule ce qui manque aux comptes, puis l'écrit : deux
 * rattrapages lancés ensemble — un double clic, deux trésoriers, un onglet
 * rechargé — calculaient chacun le même manque et l'écrivaient chacun, et la
 * même cotisation entrait deux fois en recette. Le verrou consultatif, pris
 * dans la transaction et relâché à sa fin, fait passer le second après le
 * premier : il recalcule alors sur des comptes où le manque est comblé, et
 * n'écrit rien.
 *
 * L'affectation manuelle d'une écriture prend le même verrou, pour la même
 * raison : un rattrapage qui tourne pendant qu'on pointe à la main ne doit pas
 * compter deux fois la même famille.
 */
async function verrouillerCotisations(tx: Pick<typeof db, "execute">) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('apel-manager:cotisations'))`,
  );
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
export async function rapprochement(
  schoolYear: string | null,
  lecteur: Lecteur = db,
) {
  const membres = await lecteur
    .select({
      id: associationMembers.id,
      firstName: associationMembers.firstName,
      lastName: associationMembers.lastName,
      schoolYear: associationMembers.schoolYear,
      status: associationMembers.status,
      membershipFeeCents: associationMembers.membershipFeeCents,
      donationCents: associationMembers.donationCents,
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

  const parts = await lecteur
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
      duCents: membre.membershipFeeCents + membre.donationCents,
      cotisationCents: membre.membershipFeeCents,
      donCents: membre.donationCents,
      regleLe: membre.feePaidAt,
      mode: membre.feePaymentMethod,
      comptabiliseCents: ecritures.reduce((t, e) => t + e.partCents, 0),
      ecritures,
    };
  });
}

/**
 * Les totaux que lit le trésorier : ce qui est dû, encaissé, et comptabilisé —
 * dons compris, puisque c'est ce total que les encaissements couvrent.
 */
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
    /** La part des dons dans `attendu`, pour la distinguer des cotisations. */
    dontDons: lignes.reduce((t, l) => t + l.donCents, 0),
    encaisse,
    comptabilise,
    /** Ce que le rattrapage porterait aux comptes s'il tournait maintenant. */
    aRattraperCents: manquantes.reduce((t, l) => t + l.duCents, 0),
    /** Dont les dons, que la reprise écrit à part dans leur catégorie. */
    aRattraperDonsCents: manquantes.reduce((t, l) => t + l.donCents, 0),
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
    await verrouillerCotisations(tx);
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
export async function cotisationsARattraper(
  schoolYear: string,
  lecteur: Lecteur = db,
) {
  return (await rapprochement(schoolYear, lecteur)).filter(
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
 *
 * Le don joint à une adhésion part dans une écriture à lui, dans la catégorie
 * des dons : le ranger avec les cotisations gonflerait une recette et en
 * cacherait une autre, alors qu'un don se suit à part (reçus fiscaux, bilan
 * présenté en assemblée). Les deux écritures sont rattachées à la famille, si
 * bien que ce qui est comptabilisé retombe sur ce qu'elle doit.
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

  const donationCategoryId = data.donationCategoryId ?? null;
  if (donationCategoryId !== null) {
    const [categorieDons] = await db
      .select({
        type: accountingCategories.type,
        isActive: accountingCategories.isActive,
      })
      .from(accountingCategories)
      .where(eq(accountingCategories.id, donationCategoryId))
      .limit(1);
    if (
      !categorieDons ||
      !categorieDons.isActive ||
      categorieDons.type !== "income"
    ) {
      throw new HttpError(
        400,
        "La catégorie des dons doit être une catégorie de recettes active.",
      );
    }
  }

  const { creees, retenus, total, totalDons } = await db.transaction(async (tx) => {
    // Le manque se calcule APRÈS le verrou, dans la transaction : calculé
    // avant, il resterait celui qu'un rattrapage concurrent vient de combler.
    await verrouillerCotisations(tx);
    const candidates = await cotisationsARattraper(data.schoolYear, tx);
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

    const totalCotisations = retenus.reduce((t, l) => t + l.cotisationCents, 0);
    const totalDons = retenus.reduce((t, l) => t + l.donCents, 0);
    const avecDon = retenus.filter((l) => l.donCents > 0);

    // Refusé plutôt que rangé d'office avec les cotisations : un don fondu
    // dans les cotisations ne se retrouve plus, et c'est précisément ce que
    // l'écriture séparée doit éviter.
    if (totalDons > 0 && donationCategoryId === null) {
      throw new HttpError(
        400,
        `${avecDon.length} adhésion${avecDon.length > 1 ? "s" : ""} de ce lot comporte${avecDon.length > 1 ? "nt" : ""} un don (${(totalDons / 100).toFixed(2)} €) : choisissez la catégorie des dons, où il sera enregistré à part de la cotisation. S'il n'en existe pas, créez une catégorie de recettes pour les dons dans l'onglet Comptes.`,
      );
    }
    if (totalDons > 0 && donationCategoryId === data.categoryId) {
      throw new HttpError(
        400,
        "Choisissez pour les dons une autre catégorie que celle des cotisations : c'est ce qui permet de les distinguer dans les comptes.",
      );
    }

    if (
      data.mode === "groupee" &&
      Math.max(totalCotisations, totalDons) > MONTANT_MAX_CENTIMES
    ) {
      throw new HttpError(
        400,
        "Le lot dépasse le plafond d'une écriture (1 000 000 €) : faites une écriture par adhérent, ou rattrapez en plusieurs fois.",
      );
    }

    const ecritures: { id: string; amountCents: number }[] = [];

    /**
     * Crée une écriture en brouillon et la rattache à chaque famille pour sa
     * part. Brouillon : le trésorier relit et valide. Une reprise de masse qui
     * s'écrirait directement en comptabilité validée serait immuable, donc
     * irrattrapable en cas d'erreur de sélection.
     */
    async function ecrire(
      valeurs: {
        categoryId: string;
        label: string;
        occurredAt: Date;
        counterparty: string | null;
        notes?: string;
      },
      parts: { memberId: string; amountCents: number }[],
    ) {
      const montant = parts.reduce((t, p) => t + p.amountCents, 0);
      if (montant === 0) return;
      const [entry] = await tx
        .insert(accountingEntries)
        .values({
          type: "income",
          status: "draft",
          accountId: data.accountId,
          categoryId: valeurs.categoryId,
          label: valeurs.label,
          amountCents: montant,
          occurredAt: valeurs.occurredAt,
          counterparty: valeurs.counterparty,
          paymentMethod: data.paymentMethod ?? null,
          notes: valeurs.notes ?? null,
          createdBy: actor.userId,
        })
        .returning({ id: accountingEntries.id });
      await tx.insert(membershipPayments).values(
        parts
          .filter((p) => p.amountCents > 0)
          .map((p) => ({
            entryId: entry.id,
            memberId: p.memberId,
            amountCents: p.amountCents,
            createdBy: actor.userId,
          })),
      );
      ecritures.push({ id: entry.id, amountCents: montant });
    }

    if (data.mode === "groupee") {
      const avecCotisation = retenus.filter((l) => l.cotisationCents > 0);
      await ecrire(
        {
          categoryId: data.categoryId,
          label: data.label,
          occurredAt: data.occurredAt,
          counterparty: data.counterparty ?? null,
          notes: `Reprise de ${avecCotisation.length} cotisation${avecCotisation.length > 1 ? "s" : ""} — année scolaire ${data.schoolYear}.`,
        },
        retenus.map((l) => ({
          memberId: l.memberId,
          amountCents: l.cotisationCents,
        })),
      );
      if (donationCategoryId !== null) {
        await ecrire(
          {
            categoryId: donationCategoryId,
            label: `Dons joints aux adhésions — ${data.schoolYear}`,
            occurredAt: data.occurredAt,
            counterparty: data.counterparty ?? null,
            notes: `Reprise de ${avecDon.length} don${avecDon.length > 1 ? "s" : ""} versé${avecDon.length > 1 ? "s" : ""} avec l'adhésion — année scolaire ${data.schoolYear}.`,
          },
          retenus.map((l) => ({ memberId: l.memberId, amountCents: l.donCents })),
        );
      }
    } else {
      for (const ligne of retenus) {
        // La date de règlement portée sur la fiche, quand elle existe :
        // une reprise qui daterait tout d'aujourd'hui fausserait l'exercice.
        const occurredAt = ligne.regleLe ?? data.occurredAt;
        const counterparty = data.counterparty ?? ligne.nom;
        await ecrire(
          {
            categoryId: data.categoryId,
            label: `${data.label} — ${ligne.nom}`,
            occurredAt,
            counterparty,
          },
          [{ memberId: ligne.memberId, amountCents: ligne.cotisationCents }],
        );
        if (donationCategoryId !== null) {
          await ecrire(
            {
              categoryId: donationCategoryId,
              label: `Don joint à l'adhésion — ${ligne.nom}`,
              occurredAt,
              counterparty,
            },
            [{ memberId: ligne.memberId, amountCents: ligne.donCents }],
          );
        }
      }
    }

    return {
      creees: ecritures,
      retenus,
      total: totalCotisations + totalDons,
      totalDons,
    };
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
      donsCents: totalDons,
    },
  );

  return {
    ecritures: creees.length,
    adherents: retenus.length,
    totalCents: total,
    donsCents: totalDons,
  };
}

/**
 * Ce que la comptabilité a enregistré en cotisations sur une année scolaire,
 * dons joints aux adhésions compris (ils sont rattachés aux mêmes familles),
 * validé seulement : c'est le chiffre qui a sa place dans un rapport financier.
 */
export async function totalComptabilise(schoolYear: string) {
  const [ligne] = await db
    .select({
      // `bigint` : une somme d'entiers 32 bits déborde bien avant qu'on s'en
      // doute (voir `centimesDepuisSql`).
      total: sql<string>`coalesce(sum(${membershipPayments.amountCents}), 0)::bigint`,
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
  return centimesDepuisSql(ligne?.total);
}
