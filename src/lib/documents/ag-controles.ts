import { verdictQuorum, verdictVote, votantsTotaux } from "./ag-calculs";
import type { AgMinutesPayload, ReglesStatutaires } from "./ag-types";

/**
 * Ce que l'application vérifie avant de laisser finaliser un procès-verbal.
 *
 * Elle prévient, elle ne bloque presque jamais : le secrétaire de séance est un
 * parent bénévole qui rédige le soir, et un logiciel qui refuse d'enregistrer
 * se fait remplacer par un fichier Word. Deux exceptions seulement, et toutes
 * deux sont des contradictions internes que personne ne peut vouloir : une
 * arithmétique de vote impossible, et une date de rédaction antérieure à la
 * séance. Enregistrer un brouillon, lui, n'est jamais empêché.
 */

export type SeveriteControle = "blocage" | "avertissement";

export interface Controle {
  cle: string;
  message: string;
  severite: SeveriteControle;
  /** Section à ouvrir pour corriger. */
  section: string;
}

function jours(a: string, b: string): number | null {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  return Math.round((d1 - d2) / 86_400_000);
}

export function controlerPv(
  payload: AgMinutesPayload,
  regles: ReglesStatutaires,
): Controle[] {
  const liste: Controle[] = [];
  const ajouter = (
    cle: string,
    message: string,
    section: string,
    severite: SeveriteControle = "avertissement",
  ) => liste.push({ cle, message, severite, section });

  // — Contradictions internes : les deux seuls blocages —
  payload.resolutions.forEach((resolution, index) => {
    const v = verdictVote(resolution.vote, payload.reglesVote);
    if (v.incoherence) {
      ajouter(
        `vote_incoherent_${resolution.id}`,
        `Résolution n° ${index + 1} : ${v.incoherence}`,
        "resolutions",
        "blocage",
      );
    }
  });

  if (payload.cloture.dateRedaction && payload.seance.date) {
    const ecart = jours(payload.cloture.dateRedaction, payload.seance.date);
    if (ecart !== null && ecart < 0) {
      ajouter(
        "redaction_avant_seance",
        "Le procès-verbal est daté d’avant la séance qu’il relate.",
        "cloture",
        "blocage",
      );
    } else if (ecart !== null && ecart > 90) {
      ajouter(
        "redaction_tardive",
        `Le procès-verbal est rédigé ${ecart} jours après la séance. Un délai long affaiblit sa force de conviction s’il est un jour discuté.`,
        "cloture",
      );
    }
  }

  // — Ce qui manque et qu'on regrette plus tard —
  if (!payload.seance.date) {
    ajouter("date_absente", "La date de la séance n’est pas renseignée.", "seance");
  }
  if (!payload.seance.lieu.trim()) {
    ajouter("lieu_absent", "Le lieu de la séance n’est pas renseigné.", "seance");
  }
  if (!payload.bureauSeance.president.nom.trim()) {
    ajouter(
      "president_absent",
      "Le président de séance n’est pas nommé : c’est lui qui signe le procès-verbal.",
      "bureau",
    );
  }
  if (!payload.bureauSeance.secretaire.nom.trim()) {
    ajouter(
      "secretaire_absent",
      "Le secrétaire de séance n’est pas nommé.",
      "bureau",
    );
  }
  if (payload.ordreDuJour.length === 0) {
    ajouter(
      "ordre_du_jour_vide",
      "Aucun point n’est inscrit à l’ordre du jour. C’est le premier reproche fait à une délibération contestée.",
      "convocation",
    );
  }
  if (payload.cloture.signataires.length === 0) {
    ajouter(
      "signataires_absents",
      "Aucun signataire n’est indiqué. Un procès-verbal non signé se défend mal.",
      "cloture",
    );
  }

  // — Convocation —
  if (
    regles.delaiConvocationJours &&
    payload.convocation.dateEnvoi &&
    payload.seance.date
  ) {
    const delai = jours(payload.seance.date, payload.convocation.dateEnvoi);
    if (delai !== null && delai < regles.delaiConvocationJours) {
      ajouter(
        "delai_convocation",
        `La convocation a été envoyée ${delai} jour${delai > 1 ? "s" : ""} avant la séance, alors que vos statuts en prévoient ${regles.delaiConvocationJours}.`,
        "convocation",
      );
    }
  }

  // — Quorum —
  const quorum = verdictQuorum(payload);
  if (payload.presences.quorum.type === "inconnu") {
    ajouter(
      "quorum_inconnu",
      "La règle de quorum n’est pas renseignée : le procès-verbal n’affirmera rien à ce sujet. Elle se lit dans vos statuts, et se saisit une fois pour toutes.",
      "presences",
    );
  } else if (quorum.atteint === false) {
    ajouter(
      "quorum_non_atteint",
      "Le quorum n’est pas atteint. Les délibérations prises dans ces conditions pourront être contestées ; envisagez une seconde convocation.",
      "presences",
    );
  }

  if (
    regles.plafondPouvoirs &&
    payload.presences.representes !== null &&
    payload.presences.presents !== null &&
    payload.presences.presents > 0 &&
    payload.presences.representes >
      payload.presences.presents * regles.plafondPouvoirs
  ) {
    ajouter(
      "pouvoirs_au_dela_du_plafond",
      `Vos statuts limitent à ${regles.plafondPouvoirs} pouvoir${regles.plafondPouvoirs > 1 ? "s" : ""} par personne présente : ${payload.presences.representes} pouvoirs pour ${payload.presences.presents} présents dépassent ce plafond.`,
      "presences",
    );
  }

  const votants = votantsTotaux(payload);
  payload.resolutions.forEach((resolution, index) => {
    if (resolution.vote.nonSoumiseAuVote) return;
    if (
      votants !== null &&
      resolution.vote.votants !== null &&
      resolution.vote.votants > votants
    ) {
      ajouter(
        `votants_superieurs_${resolution.id}`,
        `Résolution n° ${index + 1} : ${resolution.vote.votants} votants, alors que l’assemblée en compte ${votants}.`,
        "resolutions",
      );
    }
    if (!resolution.texte.trim()) {
      ajouter(
        `texte_manquant_${resolution.id}`,
        `Résolution n° ${index + 1} : le texte soumis au vote est vide. C’est lui qui sera exécuté, pas son intitulé.`,
        "resolutions",
      );
    }
  });

  // — Assemblée extraordinaire —
  const estAGE =
    payload.natureAssemblee === "AGE" || payload.natureAssemblee === "mixte";
  const toucheAuxStatuts = payload.resolutions.some((r) =>
    ["modification_statuts", "transfert_siege", "dissolution"].includes(r.nature),
  );
  if (toucheAuxStatuts && !estAGE) {
    ajouter(
      "statuts_hors_age",
      "Une modification des statuts, un transfert de siège ou une dissolution relèvent en principe d’une assemblée extraordinaire. Vérifiez vos statuts.",
      "seance",
    );
  }
  if (estAGE && regles.majoriteAGE && regles.majoriteAGE !== "non_precise") {
    const insuffisantes = payload.resolutions.filter(
      (r) =>
        !r.vote.nonSoumiseAuVote &&
        r.vote.regleMajorite !== "non_precise" &&
        r.vote.regleMajorite !== regles.majoriteAGE,
    );
    if (insuffisantes.length > 0) {
      ajouter(
        "majorite_age",
        `Vos statuts exigent une majorité particulière en assemblée extraordinaire ; ${insuffisantes.length} résolution${insuffisantes.length > 1 ? "s en retiennent" : " en retient"} une autre.`,
        "resolutions",
      );
    }
  }

  // — La seule obligation légale née de la séance —
  const changeLesInstances =
    payload.instances.compositionApres.length > 0 ||
    payload.resolutions.some((r) => r.nature === "election");
  if ((changeLesInstances || toucheAuxStatuts) && !payload.formalites.echeanceDeclaration) {
    ajouter(
      "declaration_prefecture",
      "Cette assemblée change les dirigeants ou les statuts : la déclaration en préfecture est due dans les trois mois (art. 5 de la loi de 1901). Notez l’échéance pour ne pas la manquer.",
      "suites",
    );
  }

  if (!payload.diffusion.controleDonneesSensibles && payload.resolutions.some((r) => r.mentionsNominatives.length > 0)) {
    ajouter(
      "donnees_nominatives",
      "Des personnes sont nommées dans les débats. Vérifiez qu’elles l’ont demandé avant de diffuser le procès-verbal.",
      "suites",
    );
  }

  return liste;
}

/** Ce qui empêche la finalisation, par opposition à ce qui la commente. */
export function blocages(controles: Controle[]): Controle[] {
  return controles.filter((c) => c.severite === "blocage");
}
