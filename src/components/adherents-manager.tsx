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
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CotisationsRapprochement,
  type EcritureRecetteView,
  ETATS,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { ModuleStat } from "@/components/module-stat";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/client";
import { formatShortDate, toDateInput } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface AdherentView {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  status: "active" | "pending" | "inactive";
  schoolYear: string;
  membershipFeeCents: number;
  /** Don facultatif versé en plus de la cotisation ; 0 sans don. */
  donationCents: number;
  feePaidAt: string | null;
  feePaymentMethod: PaymentMethod | null;
  joinedAt: string;
  notes: string | null;
  version: number;
}

/**
 * Ce que la famille règle en tout : la cotisation et le don qu'elle y ajoute.
 * Les montants d'argent de l'écran se comptent sur ce total, comme le
 * rapprochement, puisque les deux arrivent dans le même règlement.
 */
function totalAdhesion(member: AdherentView): number {
  return member.membershipFeeCents + member.donationCents;
}

/** « 30 € », ou « 30 € + 10 € de don » : le don n'apparaît que s'il existe. */
function montantAdhesion(member: AdherentView): string {
  return member.donationCents > 0
    ? `${formatEuros(member.membershipFeeCents)} + ${formatEuros(member.donationCents)} de don`
    : formatEuros(member.membershipFeeCents);
}

const STATUS_LABELS: Record<AdherentView["status"], string> = {
  active: "Actif",
  pending: "En attente",
  inactive: "Inactif",
};

const STATUS_COLORS = {
  active: "sea",
  pending: "amber",
  inactive: "slate",
} as const;

function currentSchoolYear() {
  // Le calendrier de Paris, pas celui de la machine : le serveur (UTC) et le
  // navigateur doivent tomber sur la même année la nuit du 30 juin.
  const [annee, mois] = toDateInput(new Date()).split("-").map(Number);
  const start = mois >= 7 ? annee : annee - 1;
  return `${start}-${start + 1}`;
}

function dateInput(value: string | null) {
  return value ? toDateInput(value) : "";
}

export function AdherentsManager({
  members,
  cotisationParDefautCents = null,
  rapprochements,
  comptes,
  categoriesRecette,
  ecrituresRecette,
}: {
  members: AdherentView[];
  /**
   * Le tarif publié par l'association, quand il y en a un : une adhésion
   * nouvelle s'ouvre dessus plutôt que sur 0,00 €. On ne le force jamais — une
   * famille peut régler autre chose — mais on évite de le retaper à chaque fois.
   */
  cotisationParDefautCents?: number | null;
  /** L'état comptable de chaque adhésion, toutes années confondues. */
  rapprochements: LigneRapprochementView[];
  comptes: { id: string; name: string }[];
  categoriesRecette: { id: string; name: string }[];
  ecrituresRecette: EcritureRecetteView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AdherentView["status"]>("all");
  const [schoolYear, setSchoolYear] = useState("all");
  const [editor, setEditor] = useState<"new" | AdherentView | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const feeInEuros = Number(String(form.get("membershipFee") ?? "0"));
    // Champ laissé vide : pas de don, et non une erreur de saisie.
    const donationInEuros = Number(String(form.get("donation") || "0"));
    const body = {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email") || null,
      phone: form.get("phone") || null,
      addressLine1: form.get("addressLine1") || null,
      addressLine2: form.get("addressLine2") || null,
      postalCode: form.get("postalCode") || null,
      city: form.get("city") || null,
      country: form.get("country") || "France",
      status: form.get("status"),
      schoolYear: form.get("schoolYear"),
      membershipFeeCents: Math.round(feeInEuros * 100),
      donationCents: Math.round(donationInEuros * 100),
      feePaidAt: form.get("feePaidAt") || null,
      feePaymentMethod: form.get("feePaymentMethod") || null,
      joinedAt: form.get("joinedAt"),
      notes: form.get("notes") || null,
      ...(editor !== "new" && editor ? { version: editor.version } : {}),
    };

    try {
      if (editor === "new") {
        await api("/api/adherents", { body });
        toast("Adhérent ajouté.");
      } else if (editor) {
        await api(`/api/adherents/${editor.id}`, {
          method: "PATCH",
          body,
        });
        toast("Fiche adhérent mise à jour.");
      }
      setEditor(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

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

      {editor && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Fiche adhérent
              </p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">
                {editor === "new"
                  ? "Ajouter un adhérent"
                  : `Modifier ${editor.firstName} ${editor.lastName}`}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditor(null)}
              disabled={submitting}
              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Fermer le formulaire"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <AdherentForm
            member={editor === "new" ? null : editor}
            loading={submitting}
            onSubmit={save}
            onCancel={() => setEditor(null)}
            cotisationParDefautCents={cotisationParDefautCents}
          />
        </Card>
      )}

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
              onChange={(event) => setQuery(event.target.value)}
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
                setStatus(
                  event.target.value as "all" | AdherentView["status"],
                )
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
              onChange={(event) => setSchoolYear(event.target.value)}
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
          <Button
            type="button"
            icon={Plus}
            onClick={() => setEditor("new")}
            className="w-full lg:w-auto"
          >
            Ajouter
          </Button>
        </div>
      </Card>

      {members.length === 0 ? (
        <EmptyState
          icon={ContactRound}
          title="Aucun adhérent enregistré"
          description="Ajoutez la première fiche pour commencer le suivi des adhésions et cotisations."
          action={
            <Button
              type="button"
              size="sm"
              icon={Plus}
              onClick={() => setEditor("new")}
            >
              Ajouter le premier adhérent
            </Button>
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
                onEdit={() => setEditor(member)}
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
                      <p className="font-bold text-slate-950">
                        {member.firstName} {member.lastName}
                      </p>
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
                      <EtatComptable ligne={parAdherent.get(member.id)} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          onClick={() => setEditor(member)}
                          aria-label={`Modifier ${member.firstName} ${member.lastName}`}
                        >
                          Modifier
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={Archive}
                          className="hover:!bg-coral-50 hover:!text-coral-800"
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

/**
 * L'état comptable d'une adhésion, sous son montant.
 *
 * Muet quand il n'y a rien à dire — ni règlement, ni écriture : afficher
 * « Pas encore réglée » sous un « À régulariser » déjà écrit ajouterait du
 * bruit sans information. Le badge ne parle que lorsqu'il apprend quelque
 * chose que la ligne ne dit pas déjà.
 */
function EtatComptable({
  ligne,
}: {
  ligne: LigneRapprochementView | undefined;
}) {
  if (!ligne || ligne.etat === "attendue") return null;
  return (
    <span
      className={cn(
        "mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset",
        ETATS[ligne.etat].classe,
      )}
    >
      {ETATS[ligne.etat].texte}
    </span>
  );
}

function AdherentMobileCard({
  member,
  rapprochement,
  onEdit,
  onDelete,
}: {
  member: AdherentView;
  rapprochement: LigneRapprochementView | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-sea-500" aria-hidden="true" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-950">
              {member.firstName} {member.lastName}
            </p>
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
            <EtatComptable ligne={rapprochement} />
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Pencil}
            onClick={onEdit}
          >
            Modifier
          </Button>
          <Button
            type="button"
            size="sm"
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

function AdherentForm({
  member,
  loading,
  onSubmit,
  onCancel,
  cotisationParDefautCents,
}: {
  member: AdherentView | null;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  cotisationParDefautCents: number | null;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-7 p-5 sm:p-6">
      <section aria-labelledby="adherent-identity-title">
        <h3
          id="adherent-identity-title"
          className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-slate-500"
        >
          Identité et contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="firstName">
            <Input
              id="firstName"
              name="firstName"
              required
              defaultValue={member?.firstName}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Nom" htmlFor="lastName">
            <Input
              id="lastName"
              name="lastName"
              required
              defaultValue={member?.lastName}
              autoComplete="family-name"
            />
          </Field>
          <Field label="Adresse e-mail" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              autoComplete="email"
            />
          </Field>
          <Field label="Téléphone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={member?.phone ?? ""}
              autoComplete="tel"
            />
          </Field>
          <Field
            label="Adresse"
            htmlFor="addressLine1"
            className="sm:col-span-2"
          >
            <Input
              id="addressLine1"
              name="addressLine1"
              defaultValue={member?.addressLine1 ?? ""}
              autoComplete="address-line1"
            />
          </Field>
          <Field
            label="Complément d'adresse"
            htmlFor="addressLine2"
            className="sm:col-span-2"
          >
            <Input
              id="addressLine2"
              name="addressLine2"
              defaultValue={member?.addressLine2 ?? ""}
              autoComplete="address-line2"
            />
          </Field>
          <Field label="Code postal" htmlFor="postalCode">
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={member?.postalCode ?? ""}
              autoComplete="postal-code"
            />
          </Field>
          <Field label="Ville" htmlFor="city">
            <Input
              id="city"
              name="city"
              defaultValue={member?.city ?? ""}
              autoComplete="address-level2"
            />
          </Field>
          <Field label="Pays" htmlFor="country" className="sm:col-span-2">
            <Input
              id="country"
              name="country"
              defaultValue={member?.country ?? "France"}
              autoComplete="country-name"
            />
          </Field>
        </div>
      </section>

      <section
        aria-labelledby="adherent-membership-title"
        className="border-t-2 border-slate-100 pt-6"
      >
        <h3
          id="adherent-membership-title"
          className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-slate-500"
        >
          Adhésion et cotisation
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Statut" htmlFor="status">
            <Select
              id="status"
              name="status"
              defaultValue={member?.status ?? "pending"}
            >
              <option value="pending">En attente</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </Select>
          </Field>
          <Field label="Année scolaire" htmlFor="schoolYear">
            <Input
              id="schoolYear"
              name="schoolYear"
              required
              pattern="\d{4}-\d{4}"
              placeholder="2026-2027"
              defaultValue={member?.schoolYear ?? currentSchoolYear()}
            />
          </Field>
          <Field label="Cotisation (€)" htmlFor="membershipFee">
            <Input
              id="membershipFee"
              name="membershipFee"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={(
                (member
                  ? member.membershipFeeCents
                  : cotisationParDefautCents ?? 0) / 100
              ).toFixed(2)}
            />
          </Field>
          <Field
            label="Don supplémentaire (€)"
            htmlFor="donation"
            hint="Facultatif. Versé en plus de la cotisation, il est enregistré dans les comptes comme un don, à part de la cotisation."
          >
            <Input
              id="donation"
              name="donation"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={
                member && member.donationCents > 0
                  ? (member.donationCents / 100).toFixed(2)
                  : ""
              }
            />
          </Field>
          <Field label="Réglée le" htmlFor="feePaidAt">
            <Input
              id="feePaidAt"
              name="feePaidAt"
              type="date"
              defaultValue={dateInput(member?.feePaidAt ?? null)}
            />
          </Field>
          <Field
            label="Mode de règlement"
            htmlFor="feePaymentMethod"
            hint="Encaissé par HelloAsso, l’argent n’est pas encore sur le compte : la cotisation attendra le versement pour entrer en comptabilité."
          >
            <Select
              id="feePaymentMethod"
              name="feePaymentMethod"
              defaultValue={member?.feePaymentMethod ?? ""}
            >
              <option value="">Non précisé</option>
              {PAYMENT_METHODS.map((mode) => (
                <option key={mode} value={mode}>
                  {PAYMENT_METHOD_LABELS[mode]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Adhérent depuis le" htmlFor="joinedAt">
            <Input
              id="joinedAt"
              name="joinedAt"
              type="date"
              required
              defaultValue={
                dateInput(member?.joinedAt ?? null) ||
                toDateInput(new Date())
              }
            />
          </Field>
          <Field
            label="Notes internes"
            htmlFor="notes"
            className="sm:col-span-2 lg:col-span-3"
          >
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={member?.notes ?? ""}
              placeholder="Informations utiles à la gestion de l'adhésion…"
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Annuler
        </Button>
        <Button type="submit" loading={loading}>
          {member ? "Enregistrer les modifications" : "Ajouter l'adhérent"}
        </Button>
      </div>
    </form>
  );
}
