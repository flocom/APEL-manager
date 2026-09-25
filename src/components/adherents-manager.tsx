"use client";

import {
  Archive,
  BadgeCheck,
  CircleDollarSign,
  ContactRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  EtatComptable,
  montantAdhesion,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/components/adherent-fiche";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CotisationsRapprochement,
  type EcritureRecetteView,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { ModuleStat } from "@/components/module-stat";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Input,
  Select,
} from "@/components/ui";
import {
  type AdherentView,
  type FiltresAdherents,
  filtresDepuis,
  requeteFiltres,
} from "@/lib/adherent-view";
import { api } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Ce que la famille règle en tout : la cotisation et le don qu'elle y ajoute.
 * Les montants d'argent de l'écran se comptent sur ce total, comme le
 * rapprochement, puisque les deux arrivent dans le même règlement.
 */
function totalAdhesion(member: AdherentView): number {
  return member.membershipFeeCents + member.donationCents;
}

const LISTE = "/dashboard/adherents";

export function AdherentsManager({
  members,
  rapprochements,
  comptes,
  categoriesRecette,
  ecrituresRecette,
}: {
  members: AdherentView[];
  /** L'état comptable de chaque adhésion, toutes années confondues. */
  rapprochements: LigneRapprochementView[];
  comptes: { id: string; name: string }[];
  categoriesRecette: { id: string; name: string }[];
  ecrituresRecette: EcritureRecetteView[];
}) {
  const router = useRouter();
  const toast = useToast();
  // Les filtres partent de l'adresse, et y retournent à chaque changement :
  // la fiche ouverte depuis la liste les reçoit, et son lien de retour — comme
  // le bouton retour du navigateur — rouvre la liste telle qu'on l'a laissée.
  const depart = filtresDepuis(useSearchParams());
  const [query, setQuery] = useState(depart.q);
  const [status, setStatus] = useState(depart.statut);
  const [schoolYear, setSchoolYear] = useState(depart.annee);
  const [pendingDelete, setPendingDelete] = useState<AdherentView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const schoolYears = useMemo(
    () =>
      Array.from(new Set(members.map((member) => member.schoolYear))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [members],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return members.filter((member) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          member.firstName,
          member.lastName,
          member.email,
          member.phone,
          member.city,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery);
      const matchesStatus = status === "all" || member.status === status;
      const matchesYear =
        schoolYear === "all" || member.schoolYear === schoolYear;
      return matchesQuery && matchesStatus && matchesYear;
    });
  }, [members, query, schoolYear, status]);

  const activeCount = members.filter(
    (member) => member.status === "active",
  ).length;
  const pendingCount = members.filter(
    (member) => member.status === "pending",
  ).length;

  const parAdherent = useMemo(
    () => new Map(rapprochements.map((l) => [l.memberId, l])),
    [rapprochements],
  );

  /**
   * L'argent se compte sur ce que la liste montre, pas sur la base entière :
   * filtrer sur une année puis lire un total qui en couvre trois donnerait un
   * chiffre que rien à l'écran ne justifie.
   */
  const argent = useMemo(() => {
    const attendu = filtered.reduce((t, m) => t + totalAdhesion(m), 0);
    const dons = filtered.reduce((t, m) => t + m.donationCents, 0);
    const regles = filtered.filter((m) => m.feePaidAt);
    const encaisse = regles.reduce((t, m) => t + totalAdhesion(m), 0);
    const comptabilise = filtered.reduce(
      (t, m) => t + (parAdherent.get(m.id)?.comptabiliseCents ?? 0),
      0,
    );
    const horsComptes = filtered.filter(
      (m) => parAdherent.get(m.id)?.etat === "manquante" && totalAdhesion(m) > 0,
    );
    // Encaissé par une plateforme, pas encore versé sur le compte : à ne pas
    // confondre avec un retard, mais à ne pas taire non plus — « tout est
    // rapproché » serait faux tant que ce versement n'est pas arrivé.
    const enAttente = filtered.filter(
      (m) => parAdherent.get(m.id)?.etat === "attente_versement",
    );
    return {
      attenteCents: enAttente.reduce((t, m) => t + totalAdhesion(m), 0),
      attenteCount: enAttente.length,
      attendu,
      dons,
      encaisse,
      reglesCount: regles.length,
      comptabilise,
      horsComptesCents: horsComptes.reduce((t, m) => t + totalAdhesion(m), 0),
      horsComptesCount: horsComptes.length,
    };
  }, [filtered, parAdherent]);

  /**
   * L'année que les deux gestes de rapprochement visent. Ils créent des
   * écritures pour une année donnée : « toutes les années » n'en est pas une,
   * et on retombe alors sur la plus récente, annoncée en clair dans le panneau.
   */
  const libelleCadrage =
    schoolYear === "all"
      ? status === "all" && !query.trim()
        ? "toutes années"
        : `${filtered.length} fiche${filtered.length > 1 ? "s" : ""} filtrée${filtered.length > 1 ? "s" : ""}`
      : schoolYear;

  const anneeCible = schoolYear === "all" ? (schoolYears[0] ?? "") : schoolYear;
  const lignesDeLAnnee = useMemo(
    () => rapprochements.filter((l) => l.schoolYear === anneeCible),
    [rapprochements, anneeCible],
  );

  const filtres: FiltresAdherents = { q: query, statut: status, annee: schoolYear };
  const suffixe = requeteFiltres(filtres);

  /**
   * Réécrit l'adresse sans naviguer : Next suit `history.replaceState`, et la
   * liste ne se recharge pas à chaque lettre tapée dans la recherche.
   */
  function filtrer(modifs: Partial<FiltresAdherents>) {
    const suivants = { ...filtres, ...modifs };
    setQuery(suivants.q);
    setStatus(suivants.statut);
    setSchoolYear(suivants.annee);
    window.history.replaceState(null, "", `${LISTE}${requeteFiltres(suivants)}`);
  }

  /** La fiche d'un adhérent, qui reçoit les filtres pour son lien de retour. */
  const ficheDe = (member: AdherentView) => `${LISTE}/${member.id}${suffixe}`;
  const nouvelle = `${LISTE}/nouveau${suffixe}`;

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/adherents/${pendingDelete.id}`, { method: "DELETE" });
      toast("Adhérent archivé.");
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section
        aria-label="Indicateurs des adhérents"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <ModuleStat
          label="Adhérents"
          value={members.length}
          helper={`${activeCount} actif${activeCount > 1 ? "s" : ""}, ${pendingCount} en attente`}
          icon={UsersRound}
          tone="brand"
        />
        <ModuleStat
          label="Attendu"
          value={formatEuros(argent.attendu)}
          helper={
            argent.dons > 0
              ? `${libelleCadrage} · dont ${formatEuros(argent.dons)} de dons`
              : libelleCadrage
          }
          icon={ContactRound}
          tone="slate"
        />
        <ModuleStat
          label="Encaissé"
          value={formatEuros(argent.encaisse)}
          helper={`${argent.reglesCount} fiche${argent.reglesCount > 1 ? "s" : ""} sur ${filtered.length}`}
          icon={UserRoundCheck}
          tone="sea"
        />
        <ModuleStat
          label="Dans les comptes"
          value={formatEuros(argent.comptabilise)}
          helper={
            argent.horsComptesCount > 0
              ? `${formatEuros(argent.horsComptesCents)} encaissés hors comptes`
              : argent.attenteCount > 0
                ? `${formatEuros(argent.attenteCents)} en attente du versement`
                : "tout est rapproché"
          }
          icon={CircleDollarSign}
          tone={argent.horsComptesCount > 0 ? "coral" : "sea"}
        />
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <label htmlFor="adherents-search" className="sr-only">
              Rechercher un adhérent
            </label>
            <Input
              id="adherents-search"
              type="search"
              value={query}
              onChange={(event) => filtrer({ q: event.target.value })}
              placeholder="Nom, e-mail, téléphone ou ville…"
              className="pl-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:flex">
            <label className="sr-only" htmlFor="adherents-status">
              Filtrer par statut
            </label>
            <Select
              id="adherents-status"
              value={status}
              onChange={(event) =>
                filtrer({
                  statut: event.target.value as FiltresAdherents["statut"],
                })
              }
              className="lg:w-44"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="pending">En attente</option>
              <option value="inactive">Inactifs</option>
            </Select>
            <label className="sr-only" htmlFor="adherents-year">
              Filtrer par année scolaire
            </label>
            <Select
              id="adherents-year"
              value={schoolYear}
              onChange={(event) => filtrer({ annee: event.target.value })}
              className="lg:w-44"
            >
              <option value="all">Toutes les années</option>
              {schoolYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
          <Link
            href={nouvelle}
            className={cn(buttonClasses("primary"), "w-full lg:w-auto")}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </Link>
        </div>
      </Card>

      {members.length === 0 ? (
        <EmptyState
          icon={ContactRound}
          title="Aucun adhérent enregistré"
          description="Ajoutez la première fiche pour commencer le suivi des adhésions et cotisations."
          action={
            <Link href={nouvelle} className={buttonClasses("primary")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter le premier adhérent
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description="Modifiez la recherche ou les filtres pour retrouver un adhérent."
        />
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-3 md:hidden">
            {filtered.map((member) => (
              <AdherentMobileCard
                key={member.id}
                member={member}
                rapprochement={parAdherent.get(member.id)}
                href={ficheDe(member)}
                onDelete={() => setPendingDelete(member)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border-2 border-slate-200 bg-white md:block">
            <table className="w-full min-w-[840px] text-sm">
              <caption className="sr-only">Liste des adhérents</caption>
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Adhérent
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Statut
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Année
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Cotisation
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-bold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-brand-50/40">
                    <td className="px-5 py-4">
                      <Link
                        href={ficheDe(member)}
                        className="font-bold text-slate-950 underline-offset-2 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {member.firstName} {member.lastName}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {member.email || member.phone || "Coordonnées à compléter"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge color={STATUS_COLORS[member.status]}>
                        {STATUS_LABELS[member.status]}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-700">
                      {member.schoolYear}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold tabular-nums text-slate-950">
                        {formatEuros(member.membershipFeeCents)}
                        {member.donationCents > 0 && (
                          <span className="font-semibold text-slate-600">
                            {" "}
                            + {formatEuros(member.donationCents)} de don
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {member.feePaidAt
                          ? `Réglée le ${formatShortDate(member.feePaidAt)}`
                          : "À régulariser"}
                      </p>
                      <EtatComptable etat={parAdherent.get(member.id)?.etat} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={ficheDe(member)}
                          className={cn(buttonClasses("ghost"), "px-3")}
                          aria-label={`Modifier ${member.firstName} ${member.lastName}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Modifier
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          icon={Archive}
                          className="px-3 hover:!bg-coral-50 hover:!text-coral-800"
                          onClick={() => setPendingDelete(member)}
                          disabled={member.status === "inactive"}
                          aria-label={`Archiver ${member.firstName} ${member.lastName}`}
                        >
                          Archiver
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {schoolYears.length > 0 && (
        <section aria-label="Rapprocher les cotisations avec la comptabilité">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold text-brand-950">
              Rapprocher les cotisations
            </h2>
            <p className="text-sm font-semibold text-slate-600">
              Écritures de l’année {anneeCible}
            </p>
          </div>
          <p className="mb-3 mt-1 text-sm leading-6 text-slate-600">
            Marquer une cotisation réglée sur une fiche ne crée aucune
            écriture : la comptabilité ne se remplit pas dans le dos du
            trésorier. Ces deux gestes font le lien, quand il le décide.
          </p>
          <CotisationsRapprochement
            anneeCourante={anneeCible}
            lignes={lignesDeLAnnee}
            comptes={comptes}
            categoriesRecette={categoriesRecette}
            ecrituresRecette={ecrituresRecette}
          />
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archiver cet adhérent ?"
        description={
          pendingDelete
            ? `La fiche de ${pendingDelete.firstName} ${pendingDelete.lastName} restera consultable avec le statut inactif.`
            : ""
        }
        confirmLabel="Archiver la fiche"
        loading={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function AdherentMobileCard({
  member,
  rapprochement,
  href,
  onDelete,
}: {
  member: AdherentView;
  rapprochement: LigneRapprochementView | undefined;
  /** La fiche de l'adhérent : un vrai lien, qui marche avant l'hydratation. */
  href: string;
  onDelete: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-sea-500" aria-hidden="true" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href={href}
              className="font-bold text-slate-950 underline-offset-2 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {member.firstName} {member.lastName}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              Adhésion {member.schoolYear}
            </p>
          </div>
          <Badge color={STATUS_COLORS[member.status]}>
            {STATUS_LABELS[member.status]}
          </Badge>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          {member.email && (
            <p className="flex items-center gap-2 break-all">
              <Mail className="h-4 w-4 shrink-0 text-brand-600" />
              {member.email}
            </p>
          )}
          {member.phone && (
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-brand-600" />
              {member.phone}
            </p>
          )}
          <p className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 shrink-0 text-sea-600" />
            {member.feePaidAt
              ? `Cotisation réglée · ${montantAdhesion(member)}`
              : `Cotisation à régulariser · ${montantAdhesion(member)}`}
            <EtatComptable etat={rapprochement?.etat} />
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <Link
            href={href}
            className={buttonClasses("outline")}
            aria-label={`Modifier ${member.firstName} ${member.lastName}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Modifier
          </Link>
          <Button
            type="button"
            variant="ghost"
            icon={Archive}
            className="hover:!bg-coral-50 hover:!text-coral-800"
            onClick={onDelete}
            disabled={member.status === "inactive"}
          >
            Archiver
          </Button>
        </div>
      </div>
    </Card>
  );
}
