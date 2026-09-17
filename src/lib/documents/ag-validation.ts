import { z } from "zod";

/**
 * Validation du procès-verbal d'assemblée générale.
 *
 * Tout est facultatif et porte une valeur par défaut. C'est délibéré : le
 * brouillon s'enregistre à chaque frappe, souvent à moitié rempli, parfois
 * depuis un téléphone dans une salle de classe. Un schéma exigeant rejetterait
 * la sauvegarde précisément quand elle est la plus utile.
 *
 * Les contrôles qui comptent ne sont pas ici mais dans `ag-controles.ts` : ils
 * s'expriment en français, s'affichent à côté du champ concerné, et n'empêchent
 * la finalisation que sur une contradiction interne.
 */

const texte = (max = 20_000) => z.string().max(max).default("");
const texteCourt = (max = 300) => z.string().max(max).default("");
const dateOuNull = z.string().max(40).nullable().default(null);
const nombreOuNull = z.coerce.number().int().nullable().default(null);

const personneSchema = z.object({
  memberId: z.string().uuid().nullable().default(null),
  nom: texteCourt(),
  qualite: texteCourt(),
});

const quorumSchema = z.object({
  type: z.enum(["fraction", "nombre", "aucun", "inconnu"]).default("inconnu"),
  valeur: nombreOuNull,
  texte: texteCourt(500),
});

const majoriteSchema = z
  .enum(["simple", "absolue", "deux_tiers", "unanimite", "non_precise"])
  .default("non_precise");

const baseMajoriteSchema = z
  .enum(["suffrages_exprimes", "presents_representes", "non_precise"])
  .default("non_precise");

const modeScrutinSchema = z
  .enum(["main_levee", "bulletin_secret", "electronique", "non_precise"])
  .default("non_precise");

const voteSchema = z.object({
  modeScrutin: modeScrutinSchema,
  baseMajorite: baseMajoriteSchema,
  regleMajorite: majoriteSchema,
  votants: nombreOuNull,
  pour: nombreOuNull,
  contre: nombreOuNull,
  abstentions: nombreOuNull,
  blancsNuls: nombreOuNull,
  nePrennentPasPart: nombreOuNull,
  nonSoumiseAuVote: z.boolean().default(false),
});

const resolutionSchema = z.object({
  id: z.string().min(1).max(64),
  nature: z
    .enum([
      "approbation_pv_precedent",
      "rapport_moral",
      "approbation_comptes",
      "affectation_resultat",
      "quitus",
      "budget",
      "cotisation",
      "election",
      "modification_statuts",
      "transfert_siege",
      "dissolution",
      "devolution",
      "pouvoirs_bancaires",
      "libre",
    ])
    .default("libre"),
  intitule: texteCourt(),
  texte: texte(10_000),
  vote: voteSchema,
  mentionsNominatives: z.array(texteCourt(500)).max(50).default([]),
  conflitsInterets: z.array(texteCourt(200)).max(50).default([]),
  candidats: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        memberId: z.string().uuid().nullable().default(null),
        nom: texteCourt(),
        fonction: texteCourt(),
        voix: nombreOuNull,
        accepte: z.boolean().default(false),
      }),
    )
    .max(100)
    .default([]),
  textesStatuts: z
    .array(
      z.object({
        article: texteCourt(100),
        ancienne: texte(5000),
        nouvelle: texte(5000),
      }),
    )
    .max(30)
    .default([]),
});

export const agMinutesPayloadSchema = z.object({
  schema: z.literal(1).default(1),
  mode: z.enum(["preparation", "transcription"]).default("transcription"),
  natureAssemblee: z.enum(["AGO", "AGE", "mixte", "constitutive"]).default("AGO"),
  entete: z
    .object({
      statutsVersionDate: dateOuNull,
      affiliationApel: texteCourt(),
    })
    .default({}),
  seance: z
    .object({
      date: dateOuNull,
      heureOuverture: texteCourt(20),
      heureCloture: texteCourt(20),
      lieu: texteCourt(),
      distanciel: z
        .object({
          actif: z.boolean().default(false),
          outil: texteCourt(200),
          modalites: texte(2000),
        })
        .default({}),
      secondeConvocation: z
        .object({
          actif: z.boolean().default(false),
          premiereSeanceDate: dateOuNull,
        })
        .default({}),
    })
    .default({}),
  convocation: z
    .object({
      auteur: texteCourt(),
      dateEnvoi: dateOuNull,
      mode: texteCourt(),
      nombreDestinataires: nombreOuNull,
      incidents: texte(3000),
      documentsJoints: z.array(texteCourt()).max(30).default([]),
    })
    .default({}),
  ordreDuJour: z
    .array(z.object({ id: z.string().min(1).max(64), intitule: texteCourt(500) }))
    .max(60)
    .default([]),
  bureauSeance: z
    .object({
      president: personneSchema.default({}),
      secretaire: personneSchema.default({}),
      scrutateurs: z.array(personneSchema).max(20).default([]),
      invites: z.array(personneSchema).max(40).default([]),
    })
    .default({}),
  presences: z
    .object({
      regleVoix: z.enum(["famille", "personne", "non_precise"]).default("non_precise"),
      dateReference: dateOuNull,
      effectifVotants: nombreOuNull,
      presents: nombreOuNull,
      representes: nombreOuNull,
      pouvoirsEcartes: nombreOuNull,
      quorum: quorumSchema.default({}),
      feuilleEmargementAnnexee: z.boolean().default(false),
      incidentsSeance: texte(3000),
    })
    .default({}),
  reglesVote: z
    .object({
      modeScrutin: modeScrutinSchema.default("main_levee"),
      baseMajorite: baseMajoriteSchema,
      regleMajorite: majoriteSchema,
    })
    .default({}),
  rapports: z
    .object({
      moral: texte(30_000),
      exercice: z.object({ debut: dateOuNull, fin: dateOuNull }).default({}),
      financier: z
        .object({
          texte: texte(30_000),
          produitsCents: nombreOuNull,
          chargesCents: nombreOuNull,
          resultatCents: nombreOuNull,
          tresorerieCents: nombreOuNull,
          sourceComptable: z
            .object({
              extraitLe: texteCourt(40),
              brouillons: z.coerce.number().int().default(0),
            })
            .nullable()
            .default(null),
        })
        .default({}),
      verificateur: texte(3000),
    })
    .default({}),
  resolutions: z.array(resolutionSchema).max(100).default([]),
  instances: z
    .object({
      bureauEluPar: z.enum(["AG", "CA", "non_precise"]).default("non_precise"),
      compositionApres: z
        .array(
          z.object({
            nom: texteCourt(),
            fonction: texteCourt(),
            memberId: z.string().uuid().nullable().default(null),
          }),
        )
        .max(60)
        .default([]),
      dureeEtEffetMandats: texte(3000),
      siegesVacants: texte(2000),
    })
    .default({}),
  vieApel: z
    .object({
      engagements: texte(10_000),
      manifestations: texte(10_000),
      representants: texte(3000),
    })
    .default({}),
  age: z
    .object({
      transfertSiege: texte(5000),
      dissolution: texte(5000),
      devolution: texte(5000),
    })
    .default({}),
  formalites: z
    .object({
      pouvoirsBancaires: texte(5000),
      mandataireFormalites: texte(2000),
      echeanceDeclaration: dateOuNull,
      transmissionFederation: texte(2000),
    })
    .default({}),
  cloture: z
    .object({
      questionsDiverses: texte(20_000),
      dateRedaction: dateOuNull,
      signataires: z.array(personneSchema).max(20).default([]),
      mentionCertifieConforme: z.boolean().default(false),
      annexes: z.array(texteCourt()).max(40).default([]),
      prochaineAG: dateOuNull,
    })
    .default({}),
  diffusion: z
    .object({
      controleDonneesSensibles: z.boolean().default(false),
      perimetre: texteCourt(500),
      archivage: texteCourt(500),
    })
    .default({}),
  redaction: z
    .object({
      notesBrutes: texte(60_000),
      aRetrouver: z.array(texteCourt(120)).max(80).default([]),
      derniereSection: texteCourt(40),
    })
    .default({}),
});

/** Ce que prévoient les statuts. Chaque champ peut rester vide. */
export const reglesStatutairesSchema = z.object({
  articleAG: z.string().trim().max(120).optional(),
  delaiConvocationJours: z.coerce.number().int().min(0).max(365).optional(),
  auteurConvocation: z.string().trim().max(200).optional(),
  quorumAGO: quorumSchema.optional(),
  quorumAGE: quorumSchema.optional(),
  majoriteAGO: majoriteSchema.optional(),
  majoriteAGE: majoriteSchema.optional(),
  baseMajorite: baseMajoriteSchema.optional(),
  representationAutorisee: z.boolean().optional(),
  plafondPouvoirs: z.coerce.number().int().min(0).max(50).optional(),
  regleVoix: z.enum(["famille", "personne"]).optional(),
  dureeMandatAnnees: z.coerce.number().int().min(1).max(20).optional(),
  clotureExercice: z.string().trim().max(60).optional(),
});

export type AgMinutesPayloadInput = z.infer<typeof agMinutesPayloadSchema>;
