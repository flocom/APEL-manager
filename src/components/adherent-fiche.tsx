"use client";

import {
  Archive,
  ArrowUpRight,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ETATS,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { AdherentView } from "@/lib/adherent-view";
import { api } from "@/lib/client";
import { formatLongDate, formatShortDate, toDateInput } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

export const STATUS_LABELS: Record<AdherentView["status"], string> = {
  active: "Actif",
  pending: "En attente",
  inactive: "Inactif",
};

export const STATUS_COLORS = {
  active: "sea",
  pending: "amber",
  inactive: "slate",
} as const;

/** « 30 € », ou « 30 € + 10 € de don » : le don n'apparaît que s'il existe. */
export function montantAdhesion(member: AdherentView): string {
  return member.donationCents > 0
    ? `${formatEuros(member.membershipFeeCents)} + ${formatEuros(member.donationCents)} de don`
    : formatEuros(member.membershipFeeCents);
}

/**
 * L'état comptable d'une adhésion, sous son montant.
 *
 * Muet quand il n'y a rien à dire — ni règlement, ni écriture : afficher
 * « Pas encore réglée » sous un « À régulariser » déjà écrit ajouterait du
 * bruit sans information. Le badge ne parle que lorsqu'il apprend quelque
 * chose que la ligne ne dit pas déjà.
 */
export function EtatComptable({
  etat,
}: {
  etat: LigneRapprochementView["etat"] | undefined;
}) {
  if (!etat || etat === "attendue") return null;
  return (
    <span
      className={cn(
        "mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset",
        ETATS[etat].classe,
      )}
    >
      {ETATS[etat].texte}
    </span>
  );
}

/** L'état comptable d'une fiche et les écritures qui portent son règlement. */
export interface ComptabiliteAdherentView {
  etat: LigneRapprochementView["etat"];
  comptabiliseCents: number;
  ecritures: {
    id: string;
    label: string;
    occurredAt: string;
    status: "draft" | "posted";
    partCents: number;
  }[];
}

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

const rienAEcouter = () => () => {};

/**
 * Faux tant que la page n'est pas hydratée. Le formulaire est désormais rendu
 * par le serveur : avant que React ne s'y attache, « Enregistrer » enverrait
 * le formulaire à l'ancienne, en GET, et les coordonnées de la famille
 * finiraient dans l'adresse et les journaux. Le bouton attend donc React.
 */
function useHydrate(): boolean {
  return useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
}

/** Le corps envoyé à l'API, lu dans le formulaire. */
function corpsDuFormulaire(form: FormData) {
  const feeInEuros = Number(String(form.get("membershipFee") ?? "0"));
  // Champ laissé vide : pas de don, et non une erreur de saisie.
  const donationInEuros = Number(String(form.get("donation") || "0"));
  return {
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
  };
}

// ---------------------------------------------------------------------------
// Fiche d'un adhérent
// ---------------------------------------------------------------------------

/**
 * La fiche d'un adhérent, à sa propre adresse : ce qu'on sait de la famille,
 * où en est son règlement jusque dans les comptes, puis le formulaire pour la
 * modifier.
 *
 * Elle remplace le formulaire qui s'ouvrait en haut de la liste. Celui-ci
 * s'affichait hors de l'écran quand on cliquait « Modifier » sur une ligne du
 * bas — le clic semblait ne rien faire — et, ouvert pour une famille, il
 * gardait ses valeurs quand on en choisissait une autre : seul le titre
 * changeait, et « Enregistrer » aurait écrit la première famille sur la
 * seconde. Ici, chaque fiche a son formulaire, remonté à neuf à chaque
 * nouvelle version enregistrée.
 */
export function AdherentFiche({
  member,
  comptabilite,
}: {
  member: AdherentView;
  comptabilite: ComptabiliteAdherentView | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const pret = useHydrate();
  const [submitting, setSubmitting] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const body = {
      ...corpsDuFormulaire(new FormData(event.currentTarget)),
      version: member.version,
    };
    try {
      await api(`/api/adherents/${member.id}`, { method: "PATCH", body });
      toast("Fiche adhérent mise à jour.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function archive() {
    setArchiving(true);
    try {
      await api(`/api/adherents/${member.id}`, { method: "DELETE" });
      toast("Adhérent archivé.");
      setConfirmArchive(false);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setArchiving(false);
    }
  }

  const adresse = [
    member.addressLine1,
    member.addressLine2,
    [member.postalCode, member.city].filter(Boolean).join(" "),
    member.country !== "France" ? member.country : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-sea-500" aria-hidden="true" />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
          <section aria-labelledby="fiche-contact">
            <h2
              id="fiche-contact"
              className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
            >
              Contact
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {member.email && (
                <li>
                  <a
                    href={`mailto:${member.email}`}
                    className="flex min-h-11 items-center gap-2 break-all font-semibold text-brand-800 underline-offset-2 hover:underline"
                  >
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {member.email}
                  </a>
                </li>
              )}
              {member.phone && (
                <li>
                  <a
                    href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}
                    className="flex min-h-11 items-center gap-2 font-semibold text-brand-800 underline-offset-2 hover:underline"
                  >
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {member.phone}
                  </a>
                </li>
              )}
              {adresse.length > 0 && (
                <li className="flex gap-2 py-2">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                    aria-hidden="true"
                  />
                  <span>
                    {adresse.map((ligne) => (
                      <span key={ligne} className="block">
                        {ligne}
                      </span>
                    ))}
                  </span>
                </li>
              )}
              {!member.email && !member.phone && adresse.length === 0 && (
                <li className="py-2 text-slate-500">Coordonnées à compléter</li>
              )}
            </ul>
          </section>

          <section aria-labelledby="fiche-adhesion">
            <h2
              id="fiche-adhesion"
              className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
            >
              Adhésion
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <dt className="sr-only">Statut</dt>
                <dd>
                  <Badge color={STATUS_COLORS[member.status]}>
                    {STATUS_LABELS[member.status]}
                  </Badge>
                </dd>
                <dt className="sr-only">Année scolaire</dt>
                <dd className="font-bold text-slate-950">
                  {member.schoolYear}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Adhérent depuis le</dt>
                <dd className="font-semibold text-slate-900">
                  {formatLongDate(member.joinedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cotisation</dt>
                <dd className="font-bold tabular-nums text-slate-950">
                  {formatEuros(member.membershipFeeCents)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Don supplémentaire</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {member.donationCents > 0
                    ? formatEuros(member.donationCents)
                    : "Aucun"}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="fiche-reglement">
            <h2
              id="fiche-reglement"
              className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
            >
              Règlement
            </h2>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {member.feePaidAt
                ? `Réglée le ${formatLongDate(member.feePaidAt)}`
                : "À régulariser"}
              {member.feePaymentMethod &&
                ` · ${PAYMENT_METHOD_LABELS[member.feePaymentMethod]}`}
            </p>
            <EtatComptable etat={comptabilite?.etat} />
            {comptabilite && comptabilite.ecritures.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm text-slate-600">
                  {formatEuros(comptabilite.comptabiliseCents)} dans les
                  comptes, par :
                </p>
                <ul className="mt-2 space-y-2">
                  {comptabilite.ecritures.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-xl border-2 border-slate-100 px-3 py-2 text-sm"
                    >
                      <p className="font-semibold text-slate-900">{e.label}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                        <span>{formatShortDate(e.occurredAt)}</span>
                        <span className="font-bold tabular-nums text-slate-800">
                          {formatEuros(e.partCents)}
                        </span>
                        <Badge color={e.status === "draft" ? "amber" : "sea"}>
                          {e.status === "draft" ? "Brouillon" : "Validée"}
                        </Badge>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Aucune écriture comptable ne porte ce règlement.
              </p>
            )}
            <Link
              href="/dashboard/accounting"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-800 underline-offset-2 hover:underline"
            >
              Ouvrir la comptabilité
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
          <h2 className="text-lg font-bold text-brand-950">
            Modifier la fiche
          </h2>
          <Button
            type="button"
            variant="dangerOutline"
            icon={Archive}
            onClick={() => setConfirmArchive(true)}
            disabled={!pret || member.status === "inactive"}
            title={
              member.status === "inactive" ? "Fiche déjà archivée" : undefined
            }
          >
            Archiver
          </Button>
        </div>
        {/* Remonté à chaque version : après un enregistrement, les champs
            repartent de ce que le serveur a gardé, pas de la saisie. */}
        <AdherentForm
          key={`${member.id}:${member.version}`}
          member={member}
          loading={submitting}
          pret={pret}
          onSubmit={save}
          secondaire={
            <Button
              type="reset"
              variant="outline"
              icon={RotateCcw}
              disabled={submitting}
            >
              Annuler les modifications
            </Button>
          }
        />
      </Card>

      <ConfirmDialog
        open={confirmArchive}
        title="Archiver cet adhérent ?"
        description={`La fiche de ${member.firstName} ${member.lastName} restera consultable avec le statut inactif.`}
        confirmLabel="Archiver la fiche"
        loading={archiving}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={archive}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nouvelle fiche
// ---------------------------------------------------------------------------

export function AdherentCreation({
  cotisationParDefautCents,
  retour,
}: {
  /**
   * Le tarif publié par l'association, quand il y en a un : une adhésion
   * nouvelle s'ouvre dessus plutôt que sur 0,00 €. On ne le force jamais — une
   * famille peut régler autre chose — mais on évite de le retaper à chaque fois.
   */
  cotisationParDefautCents: number | null;
  /** La liste telle qu'on l'a quittée, filtres compris. */
  retour: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const pret = useHydrate();
  const [submitting, setSubmitting] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { member } = await api<{ member: { id: string } }>(
        "/api/adherents",
        { body: corpsDuFormulaire(new FormData(event.currentTarget)) },
      );
      toast("Adhérent ajouté.");
      router.push(`/dashboard/adherents/${member.id}`);
    } catch (error) {
      toast((error as Error).message, "error");
      setSubmitting(false);
    }
    // En cas de succès, le bouton reste occupé jusqu'à l'ouverture de la
    // fiche : un second clic créerait la famille deux fois.
  }

  return (
    <Card className="overflow-hidden">
      <AdherentForm
        member={null}
        loading={submitting}
        pret={pret}
        onSubmit={save}
        cotisationParDefautCents={cotisationParDefautCents}
        secondaire={
          <Link href={retour} className={buttonClasses("outline")}>
            Annuler
          </Link>
        }
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------

function AdherentForm({
  member,
  loading,
  pret,
  onSubmit,
  secondaire,
  cotisationParDefautCents = null,
}: {
  member: AdherentView | null;
  loading: boolean;
  /** Faux avant l'hydratation : l'envoi attend React (voir `useHydrate`). */
  pret: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** L'action posée à côté de l'envoi : annuler, ou revenir à la liste. */
  secondaire: React.ReactNode;
  cotisationParDefautCents?: number | null;
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
                  : (cotisationParDefautCents ?? 0)) / 100
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
        {secondaire}
        <Button type="submit" loading={loading} disabled={!pret}>
          {member ? "Enregistrer les modifications" : "Ajouter l'adhérent"}
        </Button>
      </div>
    </form>
  );
}
