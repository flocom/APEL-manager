"use client";

import { ChevronDown, Plus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { ChampChoix, ChampNombre, ChampTexte, ListeTexte } from "@/components/pv/pv-champs";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { resumeResolution, verdictVote } from "@/lib/documents/ag-calculs";
import { MODELES_RESOLUTIONS } from "@/lib/documents/ag-modeles";
import type {
  AgMinutesPayload,
  PvResolution,
  RegleMajorite,
} from "@/lib/documents/ag-types";
import { voteVide } from "@/lib/documents/ag-types";
import { cn } from "@/lib/utils";

/**
 * Les résolutions et leurs votes : le cœur du procès-verbal, et la seule
 * section que personne ne peut escamoter. C'est le texte soumis au vote qui
 * sera exécuté, pas son intitulé — d'où la place donnée au texte, et le
 * décompte des voix montré en toutes lettres plutôt qu'en barre décorative.
 */

function identifiant(prefixe: string, index: number): string {
  return `${prefixe}-${index}-${String(index * 7919 + prefixe.length).slice(-5)}`;
}

const MAJORITES: { valeur: RegleMajorite; libelle: string }[] = [
  { valeur: "non_precise", libelle: "Règle de la séance" },
  { valeur: "simple", libelle: "Majorité des suffrages exprimés" },
  { valeur: "absolue", libelle: "Majorité absolue" },
  { valeur: "deux_tiers", libelle: "Majorité des deux tiers" },
  { valeur: "unanimite", libelle: "Unanimité" },
];

export function PvResolutions({
  payload,
  onChange,
}: {
  payload: AgMinutesPayload;
  onChange: (suite: PvResolution[]) => void;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);

  function ajouter(modele: (typeof MODELES_RESOLUTIONS)[number]) {
    const id = identifiant("res", payload.resolutions.length + 1);
    const resolution: PvResolution = {
      id,
      nature: modele.nature,
      intitule: modele.intitule,
      texte: modele.texte,
      vote: { ...voteVide(), regleMajorite: modele.majorite ?? "non_precise" },
      mentionsNominatives: [],
      conflitsInterets: [],
      candidats: [],
      textesStatuts: [],
    };
    onChange([...payload.resolutions, resolution]);
    setOuverte(id);
  }

  function modifier(id: string, transformation: (r: PvResolution) => PvResolution) {
    onChange(payload.resolutions.map((r) => (r.id === id ? transformation(r) : r)));
  }

  const extraordinaire =
    payload.natureAssemblee === "AGE" || payload.natureAssemblee === "mixte";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-sand-300 bg-sand-50 p-3.5">
        <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-sand-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Textes types, à relire et à adapter à vos statuts. Les passages entre
          crochets restent à compléter.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-700">
          Ajouter une résolution
        </p>
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {MODELES_RESOLUTIONS.filter(
            (m) => !m.extraordinaire || extraordinaire,
          ).map((modele) => (
            <button
              key={modele.nature + modele.libelle}
              type="button"
              onClick={() => ajouter(modele)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {modele.libelle}
            </button>
          ))}
        </div>
      </div>

      {payload.resolutions.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
          Aucune résolution pour l’instant. Choisissez un modèle ci-dessus : le
          texte s’écrit tout seul, il ne reste qu’à compléter les crochets et à
          saisir les voix.
        </p>
      ) : (
        <ol className="space-y-3">
          {payload.resolutions.map((resolution, index) => {
            const estOuverte = ouverte === resolution.id;
            const v = verdictVote(resolution.vote, payload.reglesVote);
            return (
              <li
                key={resolution.id}
                className={cn(
                  "overflow-hidden rounded-2xl border-2 bg-white",
                  v.incoherence ? "border-coral-300" : "border-slate-200",
                )}
              >
                <div className="flex items-start gap-3 p-3.5">
                  <button
                    type="button"
                    onClick={() => setOuverte(estOuverte ? null : resolution.id)}
                    aria-expanded={estOuverte}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-extrabold text-brand-800"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold text-slate-950">
                        {resolution.intitule || "Résolution sans intitulé"}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">
                        {resumeResolution(resolution, payload.reglesVote)}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        estOuverte && "rotate-180",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(payload.resolutions.filter((r) => r.id !== resolution.id))
                    }
                    aria-label={`Supprimer la résolution n° ${index + 1}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-coral-50 hover:text-coral-700 focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {estOuverte && (
                  <div className="space-y-4 border-t-2 border-slate-100 bg-slate-50/60 p-4">
                    <ChampTexte
                      label="Intitulé"
                      valeur={resolution.intitule}
                      onChange={(intitule) =>
                        modifier(resolution.id, (r) => ({ ...r, intitule }))
                      }
                    />
                    <div>
                      <label
                        htmlFor={`texte-${resolution.id}`}
                        className="mb-1.5 block text-sm font-bold text-slate-700"
                      >
                        Texte soumis au vote
                      </label>
                      <Textarea
                        id={`texte-${resolution.id}`}
                        rows={5}
                        value={resolution.texte}
                        onChange={(e) =>
                          modifier(resolution.id, (r) => ({ ...r, texte: e.target.value }))
                        }
                      />
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">
                        C’est ce texte qui sera exécuté et qu’on relira dans deux
                        ans. Remplacez chaque passage entre crochets.
                      </p>
                    </div>

                    <ChampBooleanLigne
                      label="Point exposé, non soumis au vote"
                      valeur={resolution.vote.nonSoumiseAuVote}
                      onChange={(nonSoumiseAuVote) =>
                        modifier(resolution.id, (r) => ({
                          ...r,
                          vote: { ...r.vote, nonSoumiseAuVote },
                        }))
                      }
                    />

                    {!resolution.vote.nonSoumiseAuVote && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ChampChoix
                            label="Mode de scrutin"
                            valeur={resolution.vote.modeScrutin}
                            onChange={(modeScrutin) =>
                              modifier(resolution.id, (r) => ({
                                ...r,
                                vote: { ...r.vote, modeScrutin },
                              }))
                            }
                            options={[
                              { valeur: "main_levee", libelle: "À main levée" },
                              { valeur: "bulletin_secret", libelle: "À bulletin secret" },
                              { valeur: "electronique", libelle: "Vote électronique" },
                              { valeur: "non_precise", libelle: "Non précisé" },
                            ]}
                          />
                          <ChampChoix
                            label="Majorité requise"
                            valeur={resolution.vote.regleMajorite}
                            onChange={(regleMajorite) =>
                              modifier(resolution.id, (r) => ({
                                ...r,
                                vote: { ...r.vote, regleMajorite },
                              }))
                            }
                            options={MAJORITES}
                            niveau="statutaire"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <ChampNombre
                            label="Pour"
                            valeur={resolution.vote.pour}
                            onChange={(pour) =>
                              modifier(resolution.id, (r) => ({ ...r, vote: { ...r.vote, pour } }))
                            }
                          />
                          <ChampNombre
                            label="Contre"
                            valeur={resolution.vote.contre}
                            onChange={(contre) =>
                              modifier(resolution.id, (r) => ({ ...r, vote: { ...r.vote, contre } }))
                            }
                          />
                          <ChampNombre
                            label="Abstentions"
                            valeur={resolution.vote.abstentions}
                            onChange={(abstentions) =>
                              modifier(resolution.id, (r) => ({
                                ...r,
                                vote: { ...r.vote, abstentions },
                              }))
                            }
                          />
                          <ChampNombre
                            label="Votants"
                            valeur={resolution.vote.votants}
                            onChange={(votants) =>
                              modifier(resolution.id, (r) => ({
                                ...r,
                                vote: { ...r.vote, votants },
                              }))
                            }
                            aide="Laissez vide pour reprendre le total de la séance."
                          />
                        </div>

                        {/* Le verdict est annoncé, pas seulement dessiné : une
                            barre colorée ne dit rien à qui écoute la page. */}
                        <p
                          aria-live="polite"
                          className={cn(
                            "rounded-xl px-4 py-3 text-sm font-semibold leading-6",
                            v.incoherence
                              ? "bg-coral-50 text-coral-800"
                              : v.adoptee === null
                                ? "bg-slate-100 text-slate-600"
                                : v.adoptee
                                  ? "bg-sea-50 text-sea-800"
                                  : "bg-sand-100 text-sand-900",
                          )}
                        >
                          {v.incoherence ?? (v.phrase || "Saisissez les voix pour obtenir le résultat.")}
                        </p>
                      </>
                    )}

                    {resolution.nature === "election" && (
                      <Candidats
                        resolution={resolution}
                        onChange={(candidats) =>
                          modifier(resolution.id, (r) => ({ ...r, candidats }))
                        }
                      />
                    )}

                    {resolution.nature === "modification_statuts" && (
                      <ArticlesStatuts
                        resolution={resolution}
                        onChange={(textesStatuts) =>
                          modifier(resolution.id, (r) => ({ ...r, textesStatuts }))
                        }
                      />
                    )}

                    <ListeTexte
                      label="N’ont pas pris part au vote"
                      valeurs={resolution.conflitsInterets}
                      onChange={(conflitsInterets) =>
                        modifier(resolution.id, (r) => ({ ...r, conflitsInterets }))
                      }
                      ajouterLabel="Ajouter une personne"
                      placeholder="Nom de la personne concernée"
                      aide="Conflit d’intérêts : le noter protège la délibération."
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ChampBooleanLigne({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={valeur}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

function Candidats({
  resolution,
  onChange,
}: {
  resolution: PvResolution;
  onChange: (c: PvResolution["candidats"]) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-slate-700">Candidats et voix</p>
      <p className="mb-2 text-xs leading-5 text-slate-500">
        L’acceptation des fonctions est ce que vérifie la préfecture : cochez-la
        pour chaque élu présent.
      </p>
      <div className="space-y-2">
        {resolution.candidats.map((candidat, index) => (
          <div key={candidat.id} className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_2fr_1fr]">
              <Input
                value={candidat.nom}
                placeholder="Nom et prénom"
                aria-label={`Candidat ${index + 1} — nom`}
                onChange={(e) => {
                  const suite = [...resolution.candidats];
                  suite[index] = { ...candidat, nom: e.target.value };
                  onChange(suite);
                }}
              />
              <Input
                value={candidat.fonction}
                placeholder="Fonction briguée"
                aria-label={`Candidat ${index + 1} — fonction`}
                onChange={(e) => {
                  const suite = [...resolution.candidats];
                  suite[index] = { ...candidat, fonction: e.target.value };
                  onChange(suite);
                }}
              />
              <Input
                type="number"
                min={0}
                value={candidat.voix === null ? "" : String(candidat.voix)}
                placeholder="Voix"
                aria-label={`Candidat ${index + 1} — voix`}
                onChange={(e) => {
                  const suite = [...resolution.candidats];
                  suite[index] = {
                    ...candidat,
                    voix: e.target.value === "" ? null : Number(e.target.value),
                  };
                  onChange(suite);
                }}
              />
            </div>
            <label className="mt-2 flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={candidat.accepte}
                onChange={(e) => {
                  const suite = [...resolution.candidats];
                  suite[index] = { ...candidat, accepte: e.target.checked };
                  onChange(suite);
                }}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              accepte
            </label>
            <button
              type="button"
              onClick={() => onChange(resolution.candidats.filter((_, i) => i !== index))}
              aria-label={`Retirer le candidat ${index + 1}`}
              className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-coral-50 hover:text-coral-700 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={Plus}
        className="mt-2"
        onClick={() =>
          onChange([
            ...resolution.candidats,
            {
              id: identifiant("cand", resolution.candidats.length + 1),
              memberId: null,
              nom: "",
              fonction: "",
              voix: null,
              accepte: true,
            },
          ])
        }
      >
        Ajouter un candidat
      </Button>
    </div>
  );
}

function ArticlesStatuts({
  resolution,
  onChange,
}: {
  resolution: PvResolution;
  onChange: (t: PvResolution["textesStatuts"]) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-slate-700">
        Articles modifiés
      </p>
      <p className="mb-2 text-xs leading-5 text-slate-500">
        L’ancienne et la nouvelle rédaction, côte à côte : c’est ce que réclame
        la préfecture pour enregistrer la modification.
      </p>
      <div className="space-y-3">
        {resolution.textesStatuts.map((article, index) => (
          <div key={index} className="rounded-xl border-2 border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <Input
                value={article.article}
                placeholder="Article n°"
                aria-label={`Article modifié ${index + 1}`}
                onChange={(e) => {
                  const suite = [...resolution.textesStatuts];
                  suite[index] = { ...article, article: e.target.value };
                  onChange(suite);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(resolution.textesStatuts.filter((_, i) => i !== index))}
                aria-label={`Retirer l’article ${index + 1}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-coral-50 hover:text-coral-700 focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Textarea
                rows={3}
                value={article.ancienne}
                placeholder="Ancienne rédaction"
                aria-label={`Ancienne rédaction de l’article ${index + 1}`}
                onChange={(e) => {
                  const suite = [...resolution.textesStatuts];
                  suite[index] = { ...article, ancienne: e.target.value };
                  onChange(suite);
                }}
              />
              <Textarea
                rows={3}
                value={article.nouvelle}
                placeholder="Nouvelle rédaction"
                aria-label={`Nouvelle rédaction de l’article ${index + 1}`}
                onChange={(e) => {
                  const suite = [...resolution.textesStatuts];
                  suite[index] = { ...article, nouvelle: e.target.value };
                  onChange(suite);
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={Plus}
        className="mt-2"
        onClick={() =>
          onChange([...resolution.textesStatuts, { article: "", ancienne: "", nouvelle: "" }])
        }
      >
        Ajouter un article
      </Button>
    </div>
  );
}

export function BadgeNature({ nature }: { nature: AgMinutesPayload["natureAssemblee"] }) {
  const libelles = {
    AGO: "Assemblée ordinaire",
    AGE: "Assemblée extraordinaire",
    mixte: "Ordinaire et extraordinaire",
    constitutive: "Assemblée constitutive",
  };
  return <Badge color="blue">{libelles[nature]}</Badge>;
}
