import { verdictQuorum, verdictVote, votantsTotaux } from "./ag-calculs";
import type { AgMinutesPayload, PvPersonne } from "./ag-types";

/**
 * Le procès-verbal, rendu en texte et en HTML imprimable.
 *
 * Les deux sortent du même parcours de sections : deux parcours divergeraient à
 * la première évolution, et c'est la version imprimée — celle qu'on signe et
 * qu'on porte à la préfecture — qui perdrait une mention.
 *
 * Une règle tient tout le fichier : rien n'est écrit sur ce qui n'a pas été
 * saisi. Un procès-verbal muet sur le quorum vaut mieux qu'un procès-verbal qui
 * en affirme un au hasard. Les notes de rédaction, elles, ne sortent jamais.
 */

export interface IdentiteAssociation {
  associationName: string;
  schoolName: string;
  rna: string;
  headquarters: string;
}

export type VarianteRendu = "integral" | "diffusable";

function esc(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dateLongue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function euros(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function personne(p: PvPersonne): string {
  if (!p.nom.trim()) return "";
  return p.qualite.trim() ? `${p.nom} (${p.qualite})` : p.nom;
}

const NATURES: Record<AgMinutesPayload["natureAssemblee"], string> = {
  AGO: "assemblée générale ordinaire",
  AGE: "assemblée générale extraordinaire",
  mixte: "assemblée générale ordinaire et extraordinaire",
  constitutive: "assemblée générale constitutive",
};

const SCRUTINS: Record<string, string> = {
  main_levee: "à main levée",
  bulletin_secret: "à bulletin secret",
  electronique: "par vote électronique",
  non_precise: "",
};

/** Un bloc du procès-verbal : un titre, des paragraphes déjà composés. */
interface Bloc {
  titre: string;
  paragraphes: string[];
  /** Tableaux rendus en HTML, listés en texte. */
  tableaux?: { entetes: string[]; lignes: string[][] }[];
}

/**
 * Compose les blocs du procès-verbal. C'est ici que vit la totalité de la
 * rédaction ; les deux rendus ne font ensuite que l'habiller.
 */
function composer(
  payload: AgMinutesPayload,
  identite: IdentiteAssociation,
  variante: VarianteRendu,
): Bloc[] {
  const p = payload;
  const blocs: Bloc[] = [];
  const ajouter = (titre: string, paragraphes: (string | null | false)[], tableaux?: Bloc["tableaux"]) => {
    const propres = paragraphes.filter((x): x is string => Boolean(x && x.trim()));
    if (propres.length === 0 && !tableaux?.length) return;
    blocs.push({ titre, paragraphes: propres, tableaux });
  };

  // 1. L'association et la séance
  const identification = [
    identite.associationName,
    identite.headquarters.trim() ? `dont le siège social est situé ${identite.headquarters.trim()}` : null,
    identite.rna.trim() ? `déclarée sous le numéro RNA ${identite.rna.trim()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const lieuEtHeure = [
    p.seance.date ? `le ${dateLongue(p.seance.date)}` : null,
    p.seance.heureOuverture ? `à ${p.seance.heureOuverture}` : null,
    p.seance.lieu.trim() ? `à ${p.seance.lieu.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  ajouter("Identification et ouverture de la séance", [
    identification
      ? `Les membres de l’association ${identification} se sont réunis en ${NATURES[p.natureAssemblee]}${lieuEtHeure ? ` ${lieuEtHeure}` : ""}.`
      : null,
    p.entete.affiliationApel.trim()
      ? `L’association est affiliée à ${p.entete.affiliationApel.trim()}.`
      : null,
    p.entete.statutsVersionDate
      ? `Les statuts applicables sont ceux adoptés le ${dateLongue(p.entete.statutsVersionDate)}.`
      : null,
    p.seance.distanciel.actif
      ? `La participation à distance a été ouverte${p.seance.distanciel.outil.trim() ? ` par ${p.seance.distanciel.outil.trim()}` : ""}.${p.seance.distanciel.modalites.trim() ? ` ${p.seance.distanciel.modalites.trim()}` : ""}`
      : null,
    p.seance.secondeConvocation.actif
      ? `L’assemblée est réunie sur seconde convocation, la séance du ${dateLongue(p.seance.secondeConvocation.premiereSeanceDate)} n’ayant pu délibérer faute de quorum.`
      : null,
  ]);

  // 2. La convocation
  const convocation = [
    p.convocation.auteur.trim() ? `par ${p.convocation.auteur.trim()}` : null,
    p.convocation.dateEnvoi ? `le ${dateLongue(p.convocation.dateEnvoi)}` : null,
    p.convocation.mode.trim() ? `par ${p.convocation.mode.trim()}` : null,
  ].filter(Boolean);
  ajouter("Convocation et ordre du jour", [
    convocation.length
      ? `La convocation a été adressée ${convocation.join(", ")}${p.convocation.nombreDestinataires !== null ? ` à ${p.convocation.nombreDestinataires} destinataires` : ""}.`
      : null,
    p.convocation.incidents.trim() || null,
    p.ordreDuJour.length
      ? `L’ordre du jour était le suivant :\n${p.ordreDuJour.map((point, i) => `${i + 1}. ${point.intitule}`).join("\n")}`
      : null,
    p.convocation.documentsJoints.length
      ? `Documents joints à la convocation : ${p.convocation.documentsJoints.join(", ")}.`
      : null,
  ]);

  // 3. Le bureau de séance
  ajouter("Bureau de séance", [
    personne(p.bureauSeance.president)
      ? `La séance est présidée par ${personne(p.bureauSeance.president)}.`
      : null,
    personne(p.bureauSeance.secretaire)
      ? `${personne(p.bureauSeance.secretaire)} assure le secrétariat de séance.`
      : null,
    p.bureauSeance.scrutateurs.length
      ? `Scrutateurs : ${p.bureauSeance.scrutateurs.map(personne).filter(Boolean).join(", ")}.`
      : null,
    p.bureauSeance.invites.length
      ? `Assistaient également à la séance, à titre d’invités et sans voix délibérative : ${p.bureauSeance.invites.map(personne).filter(Boolean).join(", ")}. Ils ne sont comptés ni dans le quorum, ni dans les votes.`
      : null,
  ]);

  // 4. Présences et quorum
  const votants = votantsTotaux(p);
  const quorum = verdictQuorum(p);
  ajouter("Présences, pouvoirs et quorum", [
    p.presences.effectifVotants !== null
      ? `L’association comptait ${p.presences.effectifVotants} membre${p.presences.effectifVotants > 1 ? "s" : ""} disposant du droit de vote${p.presences.dateReference ? ` au ${dateLongue(p.presences.dateReference)}` : ""}${p.presences.regleVoix === "famille" ? ", à raison d’une voix par famille adhérente" : p.presences.regleVoix === "personne" ? ", à raison d’une voix par adhérent" : ""}.`
      : null,
    votants !== null
      ? `${p.presences.presents ?? 0} membre${(p.presences.presents ?? 0) > 1 ? "s étaient présents" : " était présent"} et ${p.presences.representes ?? 0} représenté${(p.presences.representes ?? 0) > 1 ? "s" : ""}, soit ${votants} voix.`
      : null,
    p.presences.pouvoirsEcartes
      ? `${p.presences.pouvoirsEcartes} pouvoir${p.presences.pouvoirsEcartes > 1 ? "s ont été écartés" : " a été écarté"}.`
      : null,
    quorum.phrase || null,
    p.presences.incidentsSeance.trim() || null,
    p.presences.feuilleEmargementAnnexee
      ? "La feuille d’émargement, signée par les membres présents, est annexée au présent procès-verbal."
      : null,
  ]);

  // 5. Rapports et comptes
  const f = p.rapports.financier;
  ajouter("Rapports et comptes de l’exercice", [
    p.rapports.exercice.debut || p.rapports.exercice.fin
      ? `Les comptes présentés portent sur l’exercice ${p.rapports.exercice.debut ? `ouvert le ${dateLongue(p.rapports.exercice.debut)}` : ""}${p.rapports.exercice.fin ? ` et clos le ${dateLongue(p.rapports.exercice.fin)}` : ""}.`
      : null,
    p.rapports.moral.trim() || null,
    f.texte.trim() || null,
    f.produitsCents !== null || f.chargesCents !== null || f.resultatCents !== null
      ? `Les comptes font apparaître ${[
          f.produitsCents !== null ? `un total de produits de ${euros(f.produitsCents)}` : null,
          f.chargesCents !== null ? `un total de charges de ${euros(f.chargesCents)}` : null,
          f.resultatCents !== null ? `un résultat de ${euros(f.resultatCents)}` : null,
          f.tresorerieCents !== null ? `une trésorerie de ${euros(f.tresorerieCents)}` : null,
        ]
          .filter(Boolean)
          .join(", ")}.`
      : null,
    p.rapports.verificateur.trim() || null,
  ]);

  // 6. Résolutions
  if (p.resolutions.length) {
    const paragraphes: string[] = [];
    p.resolutions.forEach((resolution, index) => {
      const v = verdictVote(resolution.vote, p.reglesVote);
      const scrutin = SCRUTINS[resolution.vote.modeScrutin] || "";
      const entete = `Résolution n° ${index + 1} — ${resolution.intitule || "sans intitulé"}`;
      const corps = resolution.texte.trim();
      const conflits = resolution.conflitsInterets.length
        ? `${resolution.conflitsInterets.join(", ")} n’${resolution.conflitsInterets.length > 1 ? "ont" : "a"} pas pris part au vote.`
        : "";
      const resultat = resolution.vote.nonSoumiseAuVote
        ? "Ce point a été exposé sans être soumis au vote."
        : v.phrase
          ? `Mise aux voix${scrutin ? ` ${scrutin}` : ""}, ${v.phrase.charAt(0).toLowerCase()}${v.phrase.slice(1)}`
          : "";
      const candidats = resolution.candidats.length
        ? `Résultats par candidat : ${resolution.candidats
            .map(
              (c) =>
                `${c.nom}${c.fonction ? ` (${c.fonction})` : ""}${c.voix !== null ? ` — ${c.voix} voix` : ""}${c.accepte ? ", qui a accepté ses fonctions" : ""}`,
            )
            .join(" ; ")}.`
        : "";
      const statuts = resolution.textesStatuts.length
        ? resolution.textesStatuts
            .map(
              (t) =>
                `Article ${t.article} — ancienne rédaction : « ${t.ancienne} ». Nouvelle rédaction : « ${t.nouvelle} ».`,
            )
            .join("\n")
        : "";
      const mentions =
        variante === "integral" && resolution.mentionsNominatives.length
          ? `Mentions portées à la demande des intéressés : ${resolution.mentionsNominatives.join(" ; ")}.`
          : "";
      paragraphes.push(
        [entete, corps, statuts, conflits, resultat, candidats, mentions]
          .filter((x) => x && x.trim())
          .join("\n"),
      );
    });
    ajouter("Résolutions et votes", paragraphes);
  }

  // 7. Instances
  ajouter("Composition des instances", [
    p.instances.bureauEluPar === "CA"
      ? "Le bureau est élu par le conseil d’administration ; sa composition fera l’objet d’un procès-verbal distinct."
      : p.instances.bureauEluPar === "AG"
        ? "Le bureau est élu directement par l’assemblée générale."
        : null,
    p.instances.compositionApres.length
      ? `À l’issue de la séance, les instances sont ainsi composées :\n${p.instances.compositionApres
          .map((m) => `— ${m.nom}${m.fonction ? `, ${m.fonction}` : ""}`)
          .join("\n")}`
      : null,
    p.instances.dureeEtEffetMandats.trim() || null,
    p.instances.siegesVacants.trim() || null,
  ]);

  // 8. Vie de l'association
  ajouter("Projets et vie de l’association", [
    p.vieApel.engagements.trim() || null,
    p.vieApel.manifestations.trim() || null,
    p.vieApel.representants.trim() || null,
  ]);

  // 9. Assemblée extraordinaire
  ajouter("Décisions relevant de l’assemblée extraordinaire", [
    p.age.transfertSiege.trim() || null,
    p.age.dissolution.trim() || null,
    p.age.devolution.trim() || null,
  ]);

  // 10. Clôture
  ajouter("Questions diverses et clôture", [
    p.cloture.questionsDiverses.trim() || null,
    p.seance.heureCloture
      ? `L’ordre du jour étant épuisé, la séance est levée à ${p.seance.heureCloture}.`
      : "L’ordre du jour étant épuisé, la séance est levée.",
    p.cloture.prochaineAG
      ? `La prochaine assemblée générale est envisagée le ${dateLongue(p.cloture.prochaineAG)}.`
      : null,
  ]);

  // 11. Suites
  ajouter("Formalités et suites à donner", [
    p.formalites.pouvoirsBancaires.trim() || null,
    p.formalites.mandataireFormalites.trim() || null,
    p.formalites.echeanceDeclaration
      ? `Les modifications décidées ce jour seront déclarées en préfecture au plus tard le ${dateLongue(p.formalites.echeanceDeclaration)}, conformément à l’article 5 de la loi du 1ᵉʳ juillet 1901.`
      : null,
    p.formalites.transmissionFederation.trim() || null,
  ]);

  return blocs;
}

/** Signature de fin, commune aux deux rendus. */
function mentionsFinales(payload: AgMinutesPayload): string[] {
  const p = payload;
  const lignes: string[] = [];
  if (p.cloture.dateRedaction) {
    lignes.push(`Procès-verbal établi le ${dateLongue(p.cloture.dateRedaction)}.`);
  }
  if (p.cloture.mentionCertifieConforme) {
    lignes.push(
      "Certifié conforme. Cette mention est réclamée par certains organismes ; elle n’ajoute aucune valeur juridique au document.",
    );
  }
  if (p.cloture.annexes.length) {
    lignes.push(`Annexes : ${p.cloture.annexes.join(", ")}.`);
  }
  return lignes;
}

/** Version texte, conservée dans `content` : recherche, aperçu, repli. */
export function pvEnTexte(
  payload: AgMinutesPayload,
  identite: IdentiteAssociation,
): string {
  const blocs = composer(payload, identite, "integral");
  const corps = blocs
    .map((b) => `${b.titre.toUpperCase()}\n\n${b.paragraphes.join("\n\n")}`)
    .join("\n\n");
  const fin = mentionsFinales(payload);
  const signatures = payload.cloture.signataires
    .map(personne)
    .filter(Boolean)
    .join("\n");
  return [corps, fin.join("\n"), signatures].filter((x) => x && x.trim()).join("\n\n");
}

/**
 * Corps du document imprimable. L'en-tête de l'association et le pied de page
 * restent produits par `renderPrintableDocument`, commun à tous les documents.
 */
export function pvEnHtml(
  payload: AgMinutesPayload,
  identite: IdentiteAssociation,
  options: { variante?: VarianteRendu; projet?: boolean } = {},
): string {
  const variante = options.variante ?? "integral";
  const blocs = composer(payload, identite, variante);

  const sections = blocs
    .map(
      (b) => `<section class="bloc">
      <h2>${esc(b.titre)}</h2>
      ${b.paragraphes
        .map((texte) => `<p>${esc(texte).replace(/\n/g, "<br>")}</p>`)
        .join("\n")}
    </section>`,
    )
    .join("\n");

  const fin = mentionsFinales(payload)
    .map((ligne) => `<p class="mention">${esc(ligne)}</p>`)
    .join("\n");

  // Les cases de signature sont ce pour quoi le document est imprimé : elles
  // doivent tenir sur la même page que la mention qui les introduit.
  const signatures = payload.cloture.signataires.length
    ? `<section class="signatures">
        <p class="mention">Le présent procès-verbal est signé par :</p>
        <div class="cases">
          ${payload.cloture.signataires
            .map(
              (s) => `<div class="case">
                <div class="nom">${esc(s.nom)}</div>
                <div class="qualite">${esc(s.qualite)}</div>
                <div class="trait"></div>
              </div>`,
            )
            .join("\n")}
        </div>
      </section>`
    : "";

  const filigrane = options.projet
    ? `<div class="filigrane" aria-hidden="true">PROJET</div>`
    : "";

  return `${filigrane}
    <style>
      .bloc { margin-top: 26px; page-break-inside: avoid; }
      .bloc h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color:#0e6d68; margin: 0 0 8px; }
      .bloc p { margin: 0 0 10px; text-align: justify; }
      .mention { color:#4b6473; font-size: 13px; margin-top: 18px; }
      .signatures { margin-top: 34px; page-break-inside: avoid; }
      .cases { display: flex; flex-wrap: wrap; gap: 26px; margin-top: 14px; }
      .case { min-width: 200px; flex: 1; }
      .case .nom { font-weight: 700; }
      .case .qualite { color:#4b6473; font-size: 13px; }
      .case .trait { border-bottom: 1px solid #8ea3ae; height: 46px; }
      .filigrane {
        position: fixed; top: 42%; left: 0; right: 0; text-align: center;
        font-size: 96px; font-weight: 800; color: rgba(145, 68, 87, .10);
        letter-spacing: .2em; transform: rotate(-24deg); z-index: 0;
      }
    </style>
    ${sections}
    ${fin}
    ${signatures}`;
}
