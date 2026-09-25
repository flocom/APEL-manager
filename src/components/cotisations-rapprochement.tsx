"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  HandCoins,
  Link2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Le rapprochement des cotisations avec la comptabilité.
 *
 * Deux gestes, et deux seulement, parce que ce sont les deux qui se présentent
 * dans l'année :
 *
 *  — POINTER un encaissement déjà enregistré. C'est le cas HelloAsso : un
 *    virement groupé arrive sur le compte, le trésorier l'a saisi comme une
 *    ligne, et il faut dire quelles familles il couvre. Le total coché se
 *    compare en permanence au montant de l'écriture : c'est le seul moyen de
 *    voir qu'il manque une famille, ou qu'on en a coché une de trop.
 *
 *  — REPRENDRE ce qui a été encaissé avant que ce rapprochement existe. Sans
 *    cela, la comptabilité démarre avec un trou sur l'année en cours.
 *
 * Ce qu'une famille doit, c'est sa cotisation plus le don qu'elle y a ajouté :
 * les deux arrivent dans le même règlement. Le pointage coche donc le total ;
 * la reprise, qui crée elle-même les écritures, range le don à part, dans la
 * catégorie des dons.
 *
 * Rien ici ne modifie une fiche d'adhérent : on n'écrit que dans la
 * comptabilité, et toujours de façon rattachable, donc défaisable.
 */

export interface LigneRapprochementView {
  memberId: string;
  nom: string;
  schoolYear: string;
  statut: "active" | "pending" | "inactive";
  /** Cotisation + don : ce qu'un encaissement doit couvrir pour cette famille. */
  duCents: number;
  cotisationCents: number;
  donCents: number;
  regleLe: string | null;
  /** Mode de règlement, pour reconnaître les encaissements de plateforme. */
  mode: PaymentMethod | null;
  comptabiliseCents: number;
  etat:
    | "rapprochee"
    | "manquante"
    | "ecart"
    | "attendue"
    | "non_pointee"
    | "attente_versement";
  ecritures: { id: string; label: string; partCents: number }[];
}

export interface EcritureRecetteView {
  id: string;
  label: string;
  occurredAt: string;
  amountCents: number;
  status: "draft" | "posted";
  affecteCents: number;
}

/** Le vocabulaire des états, partagé avec le tableau des adhérents. */
export const ETATS: Record<
  LigneRapprochementView["etat"],
  { texte: string; classe: string }
> = {
  rapprochee: {
    texte: "Dans les comptes",
    classe: "bg-sea-100 text-sea-800 ring-sea-300",
  },
  manquante: {
    texte: "Encaissée, hors comptes",
    classe: "bg-coral-50 text-coral-800 ring-coral-300",
  },
  // Ni vert ni rouge : ce n'est pas rapproché, mais rien ne cloche. L'argent
  // est encaissé, il n'est simplement pas encore arrivé sur le compte.
  attente_versement: {
    texte: "En attente du versement",
    classe: "bg-brand-50 text-brand-800 ring-brand-200",
  },
  ecart: {
    texte: "Montant différent",
    classe: "bg-sand-100 text-sand-900 ring-sand-300",
  },
  attendue: {
    texte: "Pas encore réglée",
    classe: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  non_pointee: {
    texte: "Dans les comptes, fiche non pointée",
    classe: "bg-sand-100 text-sand-900 ring-sand-300",
  },
};

function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Une catégorie qui s'appelle visiblement « Dons », pour la proposer d'office :
 * un simple pré-choix, que le trésorier voit et peut changer. Rien n'est
 * choisi quand aucun nom ne s'y prête — mieux vaut un choix vide qu'un don
 * rangé au hasard.
 */
function categorieDonsProbable(
  categories: { id: string; name: string }[],
  exclue: string,
): string {
  return (
    categories.find((c) => c.id !== exclue && /\bdons?\b/i.test(c.name))?.id ??
    ""
  );
}

export function CotisationsRapprochement({
  anneeCourante,
  lignes,
  comptes,
  categoriesRecette,
  ecrituresRecette,
}: {
  /** L'année que les deux gestes visent, choisie dans la liste des adhérents. */
  anneeCourante: string;
  /** Les adhésions de CETTE année : c'est sur elles qu'on pointe. */
  lignes: LigneRapprochementView[];
  comptes: { id: string; name: string }[];
  categoriesRecette: { id: string; name: string }[];
  ecrituresRecette: EcritureRecetteView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [geste, setGeste] = useState<"pointer" | "reprise">("pointer");
  const [enCours, setEnCours] = useState(false);
  /**
   * `router.refresh()` ne rend pas la main : il rejoue le rendu serveur et
   * l'écran met de quelques dixièmes à plusieurs secondes à suivre. Rendre le
   * bouton dès la réponse de l'API le laissait annoncer « Porter 7 adhésions
   * aux comptes » alors qu'elles venaient d'y être portées — invitant à
   * recliquer sur un geste déjà fait. Le serveur recalcule l'état et ne crée
   * pas de doublon, mais un bouton qui ment sur ce qu'il reste à faire reste
   * un bouton qui ment. La transition tient le verrou jusqu'au rendu.
   */
  const [rafraichit, demarrerRafraichissement] = useTransition();
  const verrouille = enCours || rafraichit;

  // — Pointer une écriture existante
  const [ecritureId, setEcritureId] = useState("");
  const [coches, setCoches] = useState<Record<string, number>>({});
  const ecriture = ecrituresRecette.find((e) => e.id === ecritureId) ?? null;
  const totalCoche = Object.values(coches).reduce((t, c) => t + c, 0);
  const reste = ecriture ? ecriture.amountCents - totalCoche : 0;

  // — Reprise initiale
  const [mode, setMode] = useState<"groupee" | "par_adherent">("groupee");
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [categorieId, setCategorieId] = useState(categoriesRecette[0]?.id ?? "");
  const [categorieDonsId, setCategorieDonsId] = useState(() =>
    categorieDonsProbable(categoriesRecette, categoriesRecette[0]?.id ?? ""),
  );
  // Les dons vont ailleurs que les cotisations : la catégorie retenue pour
  // les cotisations ne figure pas parmi celles proposées pour les dons.
  const categoriesDons = categoriesRecette.filter((c) => c.id !== categorieId);
  const [libelle, setLibelle] = useState(`Cotisations ${anneeCourante}`);
  const [date, setDate] = useState(aujourdhui());

  const aRattraper = useMemo(
    () => lignes.filter((l) => l.etat === "manquante" && l.duCents > 0),
    [lignes],
  );
  const aRattraperCents = aRattraper.reduce((t, l) => t + l.duCents, 0);
  const aRattraperDonsCents = aRattraper.reduce((t, l) => t + l.donCents, 0);
  const aRattraperDonsCount = aRattraper.filter((l) => l.donCents > 0).length;
  /**
   * La reprise refuse un lot avec des dons tant que leur catégorie n'est pas
   * choisie ; le bouton le dit avant, plutôt que de laisser le serveur le
   * rappeler après un clic.
   */
  const donsSansCategorie =
    aRattraperDonsCents > 0 &&
    (categorieDonsId === "" || categorieDonsId === categorieId);
  const enAttenteVersement = useMemo(
    () => lignes.filter((l) => l.etat === "attente_versement"),
    [lignes],
  );

  /**
   * Qui proposer au pointage : tout le monde sauf les familles déjà rapprochées
   * ailleurs. Celles que l'écriture couvre déjà restent, sinon on ne pourrait
   * plus les décocher.
   *
   * L'ordre n'est pas alphabétique et c'est délibéré : un encaissement couvre
   * des règlements reçus, donc les familles pointées comme ayant payé viennent
   * d'abord, dans l'ordre où elles ont réglé. C'est celles-là que le trésorier
   * cherche, et c'est aussi celles que le remplissage automatique doit prendre.
   */
  const pointables = useMemo(
    () =>
      lignes
        .filter(
          (l) =>
            l.duCents > 0 &&
            (l.comptabiliseCents === 0 ||
              l.ecritures.some((e) => e.id === ecritureId)),
        )
        .sort((a, b) => {
          // Les encaissements de plateforme d'abord : un versement groupé les
          // couvre presque toujours, et ce sont eux qu'on vient pointer.
          const aPlateforme = a.mode === "helloasso";
          const bPlateforme = b.mode === "helloasso";
          if (aPlateforme !== bPlateforme) return aPlateforme ? -1 : 1;
          if ((a.regleLe === null) !== (b.regleLe === null)) {
            return a.regleLe === null ? 1 : -1;
          }
          if (a.regleLe && b.regleLe && a.regleLe !== b.regleLe) {
            return a.regleLe.localeCompare(b.regleLe);
          }
          return a.nom.localeCompare(b.nom, "fr");
        }),
    [lignes, ecritureId],
  );

  function choisirEcriture(id: string) {
    setEcritureId(id);
    // Les parts déjà posées reviennent cochées : on modifie une répartition,
    // on ne repart pas de zéro.
    const dejaLa: Record<string, number> = {};
    for (const ligne of lignes) {
      const part = ligne.ecritures.find((e) => e.id === id);
      if (part) dejaLa[ligne.memberId] = part.partCents;
    }
    setCoches(dejaLa);
  }

  function basculer(ligne: LigneRapprochementView) {
    setCoches((actuel) => {
      const suite = { ...actuel };
      if (suite[ligne.memberId] !== undefined) delete suite[ligne.memberId];
      else suite[ligne.memberId] = ligne.duCents;
      return suite;
    });
  }

  /**
   * Remplit jusqu'au montant de l'écriture, et seulement avec des adhésions
   * marquées réglées à la date de l'encaissement ou avant. Atteindre le bon
   * total en piochant une famille qui n'a pas payé donnerait un bandeau vert
   * mensonger — c'est exactement l'erreur qu'un pointage doit empêcher.
   */
  function toutCocher() {
    if (!ecriture) return;
    const limite = new Date(ecriture.occurredAt).getTime();
    const suite: Record<string, number> = {};
    let cumul = 0;
    for (const ligne of pointables) {
      if (ligne.comptabiliseCents > 0 && coches[ligne.memberId] === undefined) {
        continue;
      }
      if (ligne.regleLe === null) continue;
      if (new Date(ligne.regleLe).getTime() > limite) continue;
      if (cumul + ligne.duCents > ecriture.amountCents) continue;
      suite[ligne.memberId] = ligne.duCents;
      cumul += ligne.duCents;
    }
    setCoches(suite);
  }

  async function pointer() {
    if (!ecriture) return;
    setEnCours(true);
    try {
      await api(`/api/accounting/entries/${ecriture.id}/cotisations`, {
        method: "PUT",
        body: {
          affectations: Object.entries(coches).map(([memberId, amountCents]) => ({
            memberId,
            amountCents,
          })),
        },
      });
      toast(
        Object.keys(coches).length === 0
          ? "Écriture détachée de toute cotisation."
          : `${Object.keys(coches).length} adhésion${Object.keys(coches).length > 1 ? "s" : ""} rattachée${Object.keys(coches).length > 1 ? "s" : ""} à cette écriture.`,
      );
      demarrerRafraichissement(() => router.refresh());
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setEnCours(false);
    }
  }

  async function reprendre() {
    setEnCours(true);
    try {
      const bilan = await api<{
        ecritures: number;
        adherents: number;
        donsCents: number;
      }>(
        "/api/cotisations/rattrapage",
        {
          method: "POST",
          body: {
            schoolYear: anneeCourante,
            mode,
            accountId: compteId,
            categoryId: categorieId,
            donationCategoryId:
              aRattraperDonsCents > 0 && categorieDonsId ? categorieDonsId : null,
            label: libelle,
            occurredAt: new Date(date).toISOString(),
          },
        },
      );
      toast(
        `${bilan.adherents} adhésion${bilan.adherents > 1 ? "s" : ""} portée${bilan.adherents > 1 ? "s" : ""} aux comptes${bilan.donsCents > 0 ? `, dons compris (${euros(bilan.donsCents)}, dans leur catégorie)` : ""} : ${bilan.ecritures} écriture${bilan.ecritures > 1 ? "s" : ""} en brouillon, à relire puis valider.`,
      );
      demarrerRafraichissement(() => router.refresh());
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setEnCours(false);
    }
  }

  const impossible = comptes.length === 0 || categoriesRecette.length === 0;

  return (
    <div className="space-y-4">
      {impossible ? (
        <Card className="p-5">
          <EmptyState
            icon={CircleAlert}
            title="Il manque un compte ou une catégorie de recettes"
            description="Créez au moins un compte de trésorerie actif et une catégorie de recettes dans l’onglet Comptes avant de rapprocher les cotisations."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            role="tablist"
            aria-label="Rapprocher les cotisations"
            className="grid grid-cols-1 gap-1.5 border-b-2 border-slate-100 bg-slate-50 p-1.5 sm:grid-cols-2"
          >
            <Onglet
              actif={geste === "pointer"}
              icon={Link2}
              titre="Pointer un encaissement"
              aide="Un virement groupé, une remise de chèques"
              onClick={() => setGeste("pointer")}
            />
            <Onglet
              actif={geste === "reprise"}
              icon={HandCoins}
              titre="Reprise initiale"
              aide={`${aRattraper.length} adhésion${aRattraper.length > 1 ? "s" : ""} à porter aux comptes`}
              onClick={() => setGeste("reprise")}
            />
          </div>

          {geste === "pointer" ? (
            <div className="space-y-4 p-5 sm:p-6">
              <p className="text-sm font-medium leading-6 text-slate-600">
                Un reversement HelloAsso ou une remise de chèques arrive en une
                seule ligne sur le compte. Choisissez l’écriture, cochez les
                familles qu’elle couvre : le total coché doit retomber sur son
                montant. Chaque famille compte pour sa cotisation et, s’il y en
                a un, le don versé avec.
              </p>

              <Field label="Écriture à pointer" htmlFor="ecriture-a-pointer">
                <Select
                  id="ecriture-a-pointer"
                  value={ecritureId}
                  onChange={(e) => choisirEcriture(e.target.value)}
                >
                  <option value="">Choisir une recette…</option>
                  {ecrituresRecette.map((e) => (
                    <option key={e.id} value={e.id}>
                      {new Date(e.occurredAt).toLocaleDateString("fr-FR")} ·{" "}
                      {e.label} · {euros(e.amountCents)}
                      {e.affecteCents > 0
                        ? ` · ${euros(e.affecteCents)} déjà pointés`
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              {ecriture && (
                <>
                  <div
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 px-4 py-3",
                      reste === 0
                        ? "border-sea-300 bg-sea-50"
                        : reste < 0
                          ? "border-coral-300 bg-coral-50"
                          : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <p className="text-sm font-semibold text-slate-700">
                      {Object.keys(coches).length} adhésion
                      {Object.keys(coches).length > 1 ? "s" : ""} cochée
                      {Object.keys(coches).length > 1 ? "s" : ""} ·{" "}
                      <strong className="tabular-nums text-brand-950">
                        {euros(totalCoche)}
                      </strong>{" "}
                      sur {euros(ecriture.amountCents)}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-extrabold tabular-nums",
                        reste === 0
                          ? "text-sea-800"
                          : reste < 0
                            ? "text-coral-800"
                            : "text-slate-600",
                      )}
                    >
                      {reste === 0
                        ? "Le compte y est"
                        : reste > 0
                          ? `${euros(reste)} non affectés`
                          : `${euros(-reste)} de trop`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="ghost" onClick={toutCocher}>
                      Cocher les règlements reçus
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCoches({})}
                    >
                      Tout décocher
                    </Button>
                  </div>

                  <ul className="max-h-96 divide-y-2 divide-slate-100 overflow-y-auto rounded-xl border-2 border-slate-200">
                    {pointables.length === 0 && (
                      <li className="p-4 text-sm font-medium text-slate-500">
                        Toutes les adhésions de {anneeCourante} sont déjà
                        rattachées à une écriture.
                      </li>
                    )}
                    {pointables.map((ligne) => {
                      const coche = coches[ligne.memberId] !== undefined;
                      return (
                        <li key={ligne.memberId}>
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-brand-50 has-[:checked]:bg-brand-50">
                            <input
                              type="checkbox"
                              checked={coche}
                              onChange={() => basculer(ligne)}
                              className="h-5 w-5 shrink-0 rounded border-2 border-slate-300 accent-[#0873ab]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-brand-950">
                                {ligne.nom}
                              </span>
                              <span className="block text-xs font-semibold text-slate-600">
                                {ligne.regleLe
                                  ? `Réglée le ${new Date(ligne.regleLe).toLocaleDateString("fr-FR")}`
                                  : "Non marquée réglée sur la fiche"}
                                {ligne.mode && (
                                  <span className="text-slate-500">
                                    {" · "}
                                    {PAYMENT_METHOD_LABELS[ligne.mode]}
                                  </span>
                                )}
                                {ligne.donCents > 0 && (
                                  <span className="text-slate-500">
                                    {" · "}dont {euros(ligne.donCents)} de don
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-extrabold tabular-nums text-brand-950">
                              {euros(ligne.duCents)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  <Button type="button" onClick={pointer} disabled={verrouille}>
                    {verrouille ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Enregistrer le pointage
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-5 sm:p-6">
              {aRattraper.length === 0 ? (
                <EmptyState
                  icon={Check}
                  title="Rien à reprendre"
                  description={`Toutes les adhésions encaissées de ${anneeCourante} figurent déjà dans les comptes.`}
                />
              ) : (
                <>
                  <p className="text-sm font-medium leading-6 text-slate-600">
                    {aRattraper.length} adhésion
                    {aRattraper.length > 1 ? "s sont marquées réglées" : " est marquée réglée"}{" "}
                    sur {aRattraper.length > 1 ? "leurs fiches" : "sa fiche"} sans
                    figurer dans les comptes, soit{" "}
                    <strong className="text-brand-950">
                      {euros(aRattraperCents)}
                    </strong>
                    {aRattraperDonsCents > 0 && (
                      <>
                        , dont{" "}
                        <strong className="text-brand-950">
                          {euros(aRattraperDonsCents)}
                        </strong>{" "}
                        de dons, enregistrés à part des cotisations
                      </>
                    )}
                    . Les écritures créées ici naissent en brouillon : vous les
                    relisez, puis vous les validez.
                  </p>
                  {enAttenteVersement.length > 0 && (
                    <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium leading-6 text-brand-900">
                      {enAttenteVersement.length} autre
                      {enAttenteVersement.length > 1 ? "s adhésions sont" : " adhésion est"}{" "}
                      encaissée{enAttenteVersement.length > 1 ? "s" : ""} par
                      HelloAsso, soit{" "}
                      <strong>
                        {euros(
                          enAttenteVersement.reduce((t, l) => t + l.duCents, 0),
                        )}
                      </strong>
                      . Cette reprise les laisse de côté, et c’est voulu : cet
                      argent n’est pas encore sur le compte de l’association. Il
                      arrivera en un versement groupé, qui peut mêler
                      cotisations, billetterie et dons — c’est ce versement-là
                      qu’on saisira, puis qu’on pointera avec « Pointer un
                      encaissement ».
                    </p>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Forme de l’encaissement"
                      htmlFor="reprise-mode"
                      hint="Groupée si l’argent est arrivé en un seul virement, une par adhérent si chacun a remis son chèque."
                    >
                      <Select
                        id="reprise-mode"
                        value={mode}
                        onChange={(e) =>
                          setMode(e.target.value as "groupee" | "par_adherent")
                        }
                      >
                        <option value="groupee">
                          {aRattraperDonsCents > 0
                            ? `Groupée : cotisations (${euros(aRattraperCents - aRattraperDonsCents)}) et dons (${euros(aRattraperDonsCents)})`
                            : `Une écriture groupée (${euros(aRattraperCents)})`}
                        </option>
                        <option value="par_adherent">
                          Une écriture par adhérent ({aRattraper.length})
                          {aRattraperDonsCents > 0 ? ", plus une par don" : ""}
                        </option>
                      </Select>
                    </Field>
                    <Field label="Compte de trésorerie" htmlFor="reprise-compte">
                      <Select
                        id="reprise-compte"
                        value={compteId}
                        onChange={(e) => setCompteId(e.target.value)}
                      >
                        {comptes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label={
                        aRattraperDonsCents > 0
                          ? "Catégorie des cotisations"
                          : "Catégorie de recettes"
                      }
                      htmlFor="reprise-categorie"
                    >
                      <Select
                        id="reprise-categorie"
                        value={categorieId}
                        onChange={(e) => {
                          setCategorieId(e.target.value);
                          if (categorieDonsId === e.target.value) {
                            setCategorieDonsId(
                              categorieDonsProbable(
                                categoriesRecette,
                                e.target.value,
                              ),
                            );
                          }
                        }}
                      >
                        {categoriesRecette.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {aRattraperDonsCents > 0 &&
                      (categoriesDons.length === 0 ? (
                        <div className="rounded-xl bg-sand-100 px-4 py-3 text-sm font-medium leading-6 text-sand-900">
                          <p className="font-bold">Catégorie des dons</p>
                          <p className="mt-1">
                            {aRattraperDonsCount} adhésion
                            {aRattraperDonsCount > 1 ? "s comportent" : " comporte"}{" "}
                            un don, qui s’enregistre à part de la cotisation. Il
                            n’existe pas d’autre catégorie de recettes pour
                            l’accueillir : créez-en une pour les dons dans
                            l’onglet Comptes, puis revenez ici.
                          </p>
                        </div>
                      ) : (
                        <Field
                          label="Catégorie des dons"
                          htmlFor="reprise-categorie-dons"
                          hint={`${aRattraperDonsCount} adhésion${aRattraperDonsCount > 1 ? "s comportent" : " comporte"} un don (${euros(aRattraperDonsCents)}) : il part dans sa propre écriture, rattachée à la même famille.`}
                          error={
                            donsSansCategorie
                              ? "Choisissez où ranger les dons pour porter ce lot aux comptes."
                              : undefined
                          }
                        >
                          <Select
                            id="reprise-categorie-dons"
                            value={categorieDonsId}
                            onChange={(e) => setCategorieDonsId(e.target.value)}
                          >
                            <option value="">Choisir la catégorie des dons…</option>
                            {categoriesDons.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ))}
                    <Field
                      label="Date"
                      htmlFor="reprise-date"
                      hint={
                        mode === "par_adherent"
                          ? "Utilisée seulement pour les fiches sans date de règlement."
                          : undefined
                      }
                    >
                      <Input
                        id="reprise-date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </Field>
                    <Field label="Libellé" htmlFor="reprise-libelle" className="sm:col-span-2">
                      <Input
                        id="reprise-libelle"
                        value={libelle}
                        onChange={(e) => setLibelle(e.target.value)}
                        maxLength={200}
                      />
                    </Field>
                  </div>

                  <Button
                    type="button"
                    onClick={reprendre}
                    disabled={verrouille || donsSansCategorie}
                  >
                    {verrouille ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    Porter {aRattraper.length} adhésion
                    {aRattraper.length > 1 ? "s" : ""} aux comptes
                  </Button>
                </>
              )}
            </div>
          )}
        </Card>
      )}

    </div>
  );
}

function Onglet({
  actif,
  icon: Icon,
  titre,
  aide,
  onClick,
}: {
  actif: boolean;
  icon: typeof Link2;
  titre: string;
  aide: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
        actif ? "bg-brand-950 text-white" : "bg-white hover:bg-brand-50",
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", actif ? "text-sea-300" : "text-brand-700")}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{titre}</span>
        <span
          className={cn(
            "block text-xs font-semibold",
            actif ? "text-brand-100" : "text-slate-500",
          )}
        >
          {aide}
        </span>
      </span>
    </button>
  );
}
