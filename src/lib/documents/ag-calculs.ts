import type {
  AgMinutesPayload,
  AgSectionCle,
  PvResolution,
  PvVote,
  RegleQuorum,
} from "./ag-types";

/**
 * Ce que l'application peut calculer seule à partir du procès-verbal, et ce
 * qu'elle refuse de calculer faute de règle connue.
 *
 * La règle de conduite est unique : quand une donnée manque, on rend `null` et
 * l'écran se tait. Un quorum « atteint » affirmé sans connaître la règle des
 * statuts serait pire que pas de verdict du tout — c'est exactement ce qu'un
 * adhérent mécontent viendrait contester.
 */

export interface VerdictQuorum {
  /** Nombre de voix exigé, quand la règle et l'effectif sont connus. */
  exige: number | null;
  votants: number | null;
  atteint: boolean | null;
  /** Phrase destinée au procès-verbal imprimé, vide s'il n'y a rien à dire. */
  phrase: string;
}

/** Nombre de voix exigé par une règle de quorum, pour un effectif donné. */
export function quorumRequis(
  quorum: RegleQuorum,
  effectif: number | null,
): number | null {
  if (quorum.type === "aucun") return 0;
  if (quorum.type === "nombre") return quorum.valeur ?? null;
  if (quorum.type === "fraction") {
    if (!quorum.valeur || quorum.valeur <= 0) return null;
    if (effectif === null || effectif < 0) return null;
    // Le quart de 214 fait 53,5 : il faut 54 voix, jamais 53.
    return Math.ceil(effectif / quorum.valeur);
  }
  return null;
}

/**
 * Forme introduite par « à » : la phrase du verdict s'écrit « correspond à la
 * moitié », « correspond à un quart ». Les formes en « le » donneraient
 * « de le cinquième », et ce procès-verbal-là part à la préfecture.
 */
const FRACTIONS: Record<number, string> = {
  2: "la moitié",
  3: "un tiers",
  4: "un quart",
  5: "un cinquième",
  10: "un dixième",
};

export function libelleQuorum(quorum: RegleQuorum): string {
  if (quorum.type === "aucun") return "aucun quorum exigé par les statuts";
  if (quorum.type === "nombre" && quorum.valeur) {
    return `${quorum.valeur} voix`;
  }
  if (quorum.type === "fraction" && quorum.valeur) {
    return FRACTIONS[quorum.valeur] ?? `un ${quorum.valeur}ᵉ`;
  }
  return "règle inconnue";
}

export function votantsTotaux(payload: AgMinutesPayload): number | null {
  const { presents, representes } = payload.presences;
  if (presents === null && representes === null) return null;
  return (presents ?? 0) + (representes ?? 0);
}

export function verdictQuorum(payload: AgMinutesPayload): VerdictQuorum {
  const votants = votantsTotaux(payload);
  const { quorum, effectifVotants } = payload.presences;

  if (quorum.type === "inconnu") {
    return { exige: null, votants, atteint: null, phrase: "" };
  }
  if (quorum.type === "aucun") {
    return {
      exige: 0,
      votants,
      atteint: true,
      phrase:
        "Les statuts ne fixent pas de quorum ; l’assemblée a délibéré sans condition de quorum.",
    };
  }

  const exige = quorumRequis(quorum, effectifVotants);
  if (exige === null || votants === null) {
    return { exige, votants, atteint: null, phrase: "" };
  }

  const atteint = votants >= exige;
  const base =
    quorum.type === "fraction" && effectifVotants !== null
      ? `Le quorum statutaire correspond à ${libelleQuorum(quorum)} des ${effectifVotants} membres à jour, soit ${exige} voix.`
      : `Le quorum statutaire est de ${exige} voix.`;
  return {
    exige,
    votants,
    atteint,
    phrase: `${base} ${votants} voix étant réunies, le quorum ${
      atteint ? "est atteint : l’assemblée peut délibérer" : "n’est pas atteint"
    }.`,
  };
}

export interface VerdictVote {
  exprimes: number | null;
  base: number | null;
  requis: number | null;
  adoptee: boolean | null;
  phrase: string;
  /** Incohérence arithmétique franche : le seul motif de blocage assumé. */
  incoherence: string | null;
}

function seuil(regle: PvVote["regleMajorite"], base: number): number | null {
  if (regle === "simple" || regle === "absolue") return Math.floor(base / 2) + 1;
  if (regle === "deux_tiers") return Math.ceil((base * 2) / 3);
  if (regle === "unanimite") return base;
  return null;
}

const MAJORITES: Record<string, string> = {
  simple: "à la majorité des suffrages exprimés",
  absolue: "à la majorité absolue",
  deux_tiers: "à la majorité des deux tiers",
  unanimite: "à l’unanimité",
};

export function verdictVote(
  vote: PvVote,
  reglesSeance: AgMinutesPayload["reglesVote"],
): VerdictVote {
  if (vote.nonSoumiseAuVote) {
    return {
      exprimes: null,
      base: null,
      requis: null,
      adoptee: null,
      phrase: "Point exposé, non soumis au vote.",
      incoherence: null,
    };
  }

  const pour = vote.pour ?? 0;
  const contre = vote.contre ?? 0;
  const abstentions = vote.abstentions ?? 0;
  const blancsNuls = vote.blancsNuls ?? 0;
  const retraits = vote.nePrennentPasPart ?? 0;
  const rien =
    vote.pour === null && vote.contre === null && vote.abstentions === null;
  if (rien) {
    return {
      exprimes: null,
      base: null,
      requis: null,
      adoptee: null,
      phrase: "",
      incoherence: null,
    };
  }

  // Abstentions et blancs ne sont pas des suffrages exprimés : c'est la règle
  // que retiennent presque tous les statuts, et celle qui change le résultat.
  const exprimes = pour + contre;
  const total = exprimes + abstentions + blancsNuls + retraits;

  let incoherence: string | null = null;
  if (vote.votants !== null && total > vote.votants) {
    incoherence = `Le décompte atteint ${total} voix pour ${vote.votants} votants annoncés.`;
  }

  const regle =
    vote.regleMajorite !== "non_precise"
      ? vote.regleMajorite
      : reglesSeance.regleMajorite;
  const baseChoisie =
    vote.baseMajorite !== "non_precise"
      ? vote.baseMajorite
      : reglesSeance.baseMajorite;
  const base =
    baseChoisie === "presents_representes"
      ? vote.votants ?? total
      : exprimes;

  if (regle === "non_precise") {
    return {
      exprimes,
      base,
      requis: null,
      adoptee: null,
      phrase: `${pour} pour, ${contre} contre, ${abstentions} abstention${
        abstentions > 1 ? "s" : ""
      }.`,
      incoherence,
    };
  }

  const requis = seuil(regle, base);
  const adoptee = requis === null ? null : pour >= requis;
  const detail = `${pour} pour, ${contre} contre, ${abstentions} abstention${
    abstentions > 1 ? "s" : ""
  }`;
  return {
    exprimes,
    base,
    requis,
    adoptee,
    phrase:
      adoptee === null
        ? `${detail}.`
        : `La résolution est ${adoptee ? "adoptée" : "rejetée"} ${
            MAJORITES[regle] ?? ""
          } : ${detail}.`,
    incoherence,
  };
}

/** Intitulé court affiché sur une carte repliée. */
export function resumeResolution(
  resolution: PvResolution,
  reglesSeance: AgMinutesPayload["reglesVote"],
): string {
  const v = verdictVote(resolution.vote, reglesSeance);
  if (resolution.vote.nonSoumiseAuVote) return "Non soumise au vote";
  if (v.adoptee === null) return v.phrase || "Vote à renseigner";
  return `${v.adoptee ? "Adoptée" : "Rejetée"} · ${resolution.vote.pour ?? 0}–${
    resolution.vote.contre ?? 0
  }–${resolution.vote.abstentions ?? 0}`;
}

export type Completude = "vierge" | "entamee" | "complete";

function etat(valeurs: unknown[]): Completude {
  const remplies = valeurs.filter((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return v;
    return true;
  }).length;
  if (remplies === 0) return "vierge";
  return remplies === valeurs.length ? "complete" : "entamee";
}

/** Ce que le sommaire affiche : où l'on en est, section par section. */
export function completudeSection(
  payload: AgMinutesPayload,
  cle: AgSectionCle,
): Completude {
  const p = payload;
  switch (cle) {
    case "seance":
      return etat([p.seance.date, p.seance.lieu, p.seance.heureOuverture]);
    case "convocation":
      return etat([
        p.convocation.auteur,
        p.convocation.dateEnvoi,
        p.convocation.mode,
        p.ordreDuJour,
      ]);
    case "bureau":
      return etat([p.bureauSeance.president.nom, p.bureauSeance.secretaire.nom]);
    case "presences":
      return etat([
        p.presences.presents,
        p.presences.effectifVotants,
        p.presences.quorum.type !== "inconnu" ? true : null,
      ]);
    case "rapports":
      return etat([
        p.rapports.moral,
        p.rapports.exercice.debut,
        p.rapports.financier.resultatCents,
      ]);
    case "resolutions":
      return p.resolutions.length === 0
        ? "vierge"
        : p.resolutions.every(
              (r) => r.texte.trim() && (r.vote.nonSoumiseAuVote || r.vote.pour !== null),
            )
          ? "complete"
          : "entamee";
    case "instances":
      return etat([p.instances.compositionApres, p.instances.dureeEtEffetMandats]);
    case "cloture":
      return etat([
        p.seance.heureCloture,
        p.cloture.dateRedaction,
        p.cloture.signataires,
      ]);
    case "suites":
      return etat([p.diffusion.perimetre, p.formalites.mandataireFormalites]);
    default:
      return "vierge";
  }
}

/** Résumé d'une ligne affiché sous le titre de section, quand il y a de quoi. */
export function resumeSection(
  payload: AgMinutesPayload,
  cle: AgSectionCle,
): string {
  const p = payload;
  switch (cle) {
    case "seance":
      return p.seance.lieu || "";
    case "convocation":
      return p.ordreDuJour.length
        ? `${p.ordreDuJour.length} point${p.ordreDuJour.length > 1 ? "s" : ""} à l’ordre du jour`
        : "";
    case "bureau":
      return p.bureauSeance.president.nom
        ? `Présidée par ${p.bureauSeance.president.nom}`
        : "";
    case "presences": {
      const votants = votantsTotaux(p);
      if (votants === null) return "";
      const q = verdictQuorum(p);
      return `${votants} votant${votants > 1 ? "s" : ""}${
        q.atteint === null ? "" : q.atteint ? " · quorum atteint" : " · quorum non atteint"
      }`;
    }
    case "rapports":
      return p.rapports.financier.resultatCents === null
        ? ""
        : `Résultat ${(p.rapports.financier.resultatCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`;
    case "resolutions":
      return p.resolutions.length
        ? `${p.resolutions.length} résolution${p.resolutions.length > 1 ? "s" : ""}`
        : "";
    case "instances":
      return p.instances.compositionApres.length
        ? `${p.instances.compositionApres.length} membre${p.instances.compositionApres.length > 1 ? "s" : ""} élu${p.instances.compositionApres.length > 1 ? "s" : ""}`
        : "";
    case "cloture":
      return p.cloture.signataires.length
        ? `${p.cloture.signataires.length} signataire${p.cloture.signataires.length > 1 ? "s" : ""}`
        : "";
    default:
      return "";
  }
}
