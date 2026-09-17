"use client";

import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import type { ReglesStatutaires } from "@/lib/documents/ag-types";

/**
 * La fiche statutaire : ce que prévoient les statuts de l'association.
 *
 * Elle se remplit une fois, statuts sous les yeux, et sert ensuite à toutes les
 * assemblées. Chaque champ peut rester vide — c'est même le point important :
 * un champ vide vaut « règle inconnue », et l'application s'abstient alors de
 * tout verdict au lieu d'en inventer un. Forcer un choix entre un quart, un
 * tiers et une moitié ferait répondre au hasard, et le procès-verbal
 * affirmerait ensuite cette réponse avec aplomb.
 */
export function DocumentsReglesForm({ regles }: { regles: ReglesStatutaires }) {
  const router = useRouter();
  const toast = useToast();
  const [valeurs, setValeurs] = useState<ReglesStatutaires>(regles);
  const [occupe, setOccupe] = useState(false);

  function maj<K extends keyof ReglesStatutaires>(cle: K, valeur: ReglesStatutaires[K]) {
    setValeurs((precedent) => ({ ...precedent, [cle]: valeur }));
  }

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault();
    setOccupe(true);
    try {
      // Les champs laissés vides sont retirés : ils signifient « inconnu »,
      // et non « zéro ».
      const propres = Object.fromEntries(
        Object.entries(valeurs).filter(([, v]) => v !== "" && v !== undefined && v !== null),
      );
      await api("/api/documents/regles", { method: "PATCH", body: propres });
      toast("Fiche statutaire enregistrée.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/dashboard/documents"
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Tous les documents
      </Link>

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
            <ScrollText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-brand-950">
              Ce que prévoient vos statuts
            </h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              À remplir une fois, vos statuts sous les yeux. Chaque champ peut
              rester vide : l’application préfère se taire plutôt qu’affirmer une
              règle qu’elle ne connaît pas.
            </p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Article des statuts qui traite de l’assemblée"
              htmlFor="articleAG"
              hint="Pour retrouver le passage sans relire les statuts."
            >
              <Input
                id="articleAG"
                value={valeurs.articleAG ?? ""}
                placeholder="article 9"
                onChange={(e) => maj("articleAG", e.target.value)}
              />
            </Field>
            <Field
              label="Délai de convocation, en jours"
              htmlFor="delai"
              hint="Le nombre de jours entre l’envoi et la séance."
            >
              <Input
                id="delai"
                type="number"
                min={0}
                value={valeurs.delaiConvocationJours ?? ""}
                onChange={(e) =>
                  maj(
                    "delaiConvocationJours",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Qui convoque l’assemblée"
              htmlFor="auteur"
              className="sm:col-span-2"
            >
              <Input
                id="auteur"
                value={valeurs.auteurConvocation ?? ""}
                placeholder="le président, sur décision du conseil d’administration"
                onChange={(e) => maj("auteurConvocation", e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="rounded-xl border-2 border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold text-slate-700">
              Quorum de l’assemblée ordinaire
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Règle" htmlFor="quorum-type">
                <Select
                  id="quorum-type"
                  value={valeurs.quorumAGO?.type ?? "inconnu"}
                  onChange={(e) =>
                    maj("quorumAGO", {
                      ...(valeurs.quorumAGO ?? {}),
                      type: e.target.value as "fraction" | "nombre" | "aucun" | "inconnu",
                    })
                  }
                >
                  <option value="inconnu">Je ne sais pas encore</option>
                  <option value="aucun">Aucun quorum prévu</option>
                  <option value="fraction">Une fraction des membres</option>
                  <option value="nombre">Un nombre de membres</option>
                </Select>
              </Field>
              {(valeurs.quorumAGO?.type === "fraction" ||
                valeurs.quorumAGO?.type === "nombre") && (
                <Field
                  label={
                    valeurs.quorumAGO.type === "fraction"
                      ? "Dénominateur (4 pour « le quart »)"
                      : "Nombre exigé"
                  }
                  htmlFor="quorum-valeur"
                >
                  <Input
                    id="quorum-valeur"
                    type="number"
                    min={1}
                    value={valeurs.quorumAGO?.valeur ?? ""}
                    onChange={(e) =>
                      maj("quorumAGO", {
                        ...(valeurs.quorumAGO ?? { type: "fraction" }),
                        valeur: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              )}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Majorité en assemblée ordinaire"
              htmlFor="majorite-ago"
            >
              <Select
                id="majorite-ago"
                value={valeurs.majoriteAGO ?? "non_precise"}
                onChange={(e) =>
                  maj("majoriteAGO", e.target.value as ReglesStatutaires["majoriteAGO"])
                }
              >
                <option value="non_precise">Non précisée</option>
                <option value="simple">Majorité des suffrages exprimés</option>
                <option value="absolue">Majorité absolue</option>
                <option value="deux_tiers">Deux tiers</option>
                <option value="unanimite">Unanimité</option>
              </Select>
            </Field>
            <Field
              label="Majorité en assemblée extraordinaire"
              htmlFor="majorite-age"
            >
              <Select
                id="majorite-age"
                value={valeurs.majoriteAGE ?? "non_precise"}
                onChange={(e) =>
                  maj("majoriteAGE", e.target.value as ReglesStatutaires["majoriteAGE"])
                }
              >
                <option value="non_precise">Non précisée</option>
                <option value="simple">Majorité des suffrages exprimés</option>
                <option value="absolue">Majorité absolue</option>
                <option value="deux_tiers">Deux tiers</option>
                <option value="unanimite">Unanimité</option>
              </Select>
            </Field>
            <Field
              label="Une voix par"
              htmlFor="regle-voix"
              hint="Beaucoup d’APEL comptent une voix par famille adhérente."
            >
              <Select
                id="regle-voix"
                value={valeurs.regleVoix ?? ""}
                onChange={(e) =>
                  maj(
                    "regleVoix",
                    e.target.value === ""
                      ? undefined
                      : (e.target.value as "famille" | "personne"),
                  )
                }
              >
                <option value="">Non précisée</option>
                <option value="famille">Famille adhérente</option>
                <option value="personne">Adhérent</option>
              </Select>
            </Field>
            <Field
              label="Pouvoirs par personne présente"
              htmlFor="plafond"
              hint="Le plafond fixé par vos statuts, s’il y en a un."
            >
              <Input
                id="plafond"
                type="number"
                min={0}
                value={valeurs.plafondPouvoirs ?? ""}
                onChange={(e) =>
                  maj(
                    "plafondPouvoirs",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="Durée des mandats, en années" htmlFor="duree">
              <Input
                id="duree"
                type="number"
                min={1}
                value={valeurs.dureeMandatAnnees ?? ""}
                onChange={(e) =>
                  maj(
                    "dureeMandatAnnees",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Clôture de l’exercice"
              htmlFor="cloture"
              hint="Telle qu’elle est écrite dans les statuts."
            >
              <Input
                id="cloture"
                value={valeurs.clotureExercice ?? ""}
                placeholder="31 août"
                onChange={(e) => maj("clotureExercice", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end border-t-2 border-slate-100 bg-slate-50 p-4">
          <Button type="submit" loading={occupe}>
            Enregistrer la fiche
          </Button>
        </div>
      </Card>
    </form>
  );
}
