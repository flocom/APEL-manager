"use client";

import { ExternalLink, Paperclip, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Input } from "@/components/ui";
import {
  type EcritureCandidate,
  ecrituresPourRecu,
  type ReceiptView,
  recusPourEcriture,
} from "@/lib/accounting/receipts";
import { ApiError, api } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

import { AccountingModal } from "./modal";
import { ReceiptThumbnail } from "./receipt-preview";

/** Ce que la fenêtre affiche d'une écriture, en plus de ce que le classement lit. */
export type ReceiptLinkEntry = EcritureCandidate & {
  type: "income" | "expense";
  status: "draft" | "posted";
};

/**
 * Score à partir duquel une proposition est marquée « Correspond » : il faut
 * au moins le même montant (voir `proximite`). Une date voisine ou des mots
 * communs seuls rapprochent, sans suffire.
 */
export const SCORE_CORRESPOND = 100;

/** Lignes affichées à la fois : au-delà, on affine la recherche. */
const VISIBLE_MAX = 50;

function normalize(text: string) {
  return text
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Le montant sous les formes qu'on tape : « 1 234,50 € », « 1234,50 », « 1234.50 ». */
function amountText(cents: number) {
  const plain = (cents / 100).toFixed(2);
  return `${formatEuros(cents)} ${plain} ${plain.replace(".", ",")}`;
}

/** Date du reçu ou montant manquant : une phrase plutôt qu'un vide. */
export function receiptFacts(receipt: ReceiptView) {
  return [
    receipt.amountCents !== null
      ? formatEuros(receipt.amountCents)
      : "Montant non renseigné",
    receipt.receiptDate
      ? `reçu du ${formatShortDate(receipt.receiptDate)}`
      : `déposé le ${formatShortDate(receipt.createdAt)}`,
  ].join(" · ");
}

type ReceiptLinkDialogProps = {
  onClose: () => void;
  /** Le justificatif est associé : la fenêtre se ferme, la page se recharge. */
  onAttached: () => void;
} & (
  | {
      /** Depuis la boîte : on cherche l'écriture que ce reçu justifie. */
      mode: "receipt";
      receipt: ReceiptView;
      entries: ReceiptLinkEntry[];
    }
  | {
      /** Depuis une écriture sans justificatif : on cherche son reçu. */
      mode: "entry";
      entry: ReceiptLinkEntry;
      receipts: ReceiptView[];
    }
);

/**
 * Associe un reçu de la boîte à une écriture. Deux points de départ : le reçu
 * (on choisit parmi les écritures sans justificatif) ou l'écriture (on choisit
 * parmi les reçus en attente). Les propositions les plus proches — même
 * montant, date voisine, mots communs — viennent en tête.
 */
export function ReceiptLinkDialog(props: ReceiptLinkDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const { onClose, onAttached } = props;
  const receipt = props.mode === "receipt" ? props.receipt : null;
  const entries = props.mode === "receipt" ? props.entries : null;
  const entry = props.mode === "entry" ? props.entry : null;
  const receipts = props.mode === "entry" ? props.receipts : null;

  const options = useMemo(() => {
    if (receipt && entries) {
      return ecrituresPourRecu(receipt, entries).map(({ ecriture, score }) => ({
        id: ecriture.id,
        score,
        haystack: normalize(
          `${ecriture.label} ${ecriture.counterparty ?? ""} ${amountText(ecriture.amountCents)}`,
        ),
        entry: ecriture,
        receipt: null,
      }));
    }
    if (entry && receipts) {
      return recusPourEcriture(entry, receipts).map(({ recu, score }) => ({
        id: recu.id,
        score,
        haystack: normalize(
          `${recu.filename} ${recu.label ?? ""} ${
            recu.amountCents !== null ? amountText(recu.amountCents) : ""
          }`,
        ),
        entry: null,
        receipt: recu,
      }));
    }
    return [];
  }, [entries, entry, receipt, receipts]);

  const [query, setQuery] = useState("");
  // Une seule proposition qui correspond : déjà choisie, il reste à confirmer.
  const [choice, setChoice] = useState(() =>
    options.length > 0 &&
    options[0].score >= SCORE_CORRESPOND &&
    (options.length === 1 || options[1].score < SCORE_CORRESPOND)
      ? options[0].id
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Après un rechargement (écriture justifiée entre-temps, reçu supprimé), le
  // choix peut ne plus figurer parmi les propositions.
  const chosen = options.find((option) => option.id === choice) ?? null;

  const normalizedQuery = normalize(query.trim());
  const filtered = normalizedQuery
    ? options.filter((option) => option.haystack.includes(normalizedQuery))
    : options;
  const shown = filtered.slice(0, VISIBLE_MAX);
  // Le choix reste visible même quand la recherche l'écarte : on voit
  // toujours ce que le bouton va associer.
  if (chosen && !shown.includes(chosen)) shown.unshift(chosen);

  const previewed = receipt ?? chosen?.receipt ?? null;
  const noun = receipt ? "écriture" : "reçu";

  async function attach() {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    const receiptId = receipt ? receipt.id : chosen.id;
    const entryId = entry ? entry.id : chosen.id;
    try {
      await api<{ ok: true; entryId: string }>(
        `/api/accounting/receipts/${receiptId}/attach`,
        { body: { entryId } },
      );
      toast("Justificatif associé.");
      onAttached();
    } catch (caught) {
      const message = (caught as Error).message;
      setSaving(false);
      const status = caught instanceof ApiError ? caught.status : null;
      // Le reçu ou l'écriture a disparu, ou l'écriture de départ a reçu un
      // justificatif entre-temps : la fenêtre ne vise plus rien de possible,
      // une nouvelle tentative échouerait pareil. On la ferme et on recharge.
      if (status === 404 || (status === 409 && props.mode === "entry")) {
        toast(message, "error");
        onClose();
        router.refresh();
        return;
      }
      setError(message);
      // L'écriture choisie a reçu un justificatif entre-temps : la page
      // rechargée la retire des propositions, le choix est à refaire.
      if (status === 409) {
        setChoice("");
        router.refresh();
      }
    }
  }

  return (
    <AccountingModal
      title={receipt ? "Associer à une écriture" : "Associer un reçu"}
      eyebrow="Boîte à justificatifs"
      busy={saving}
      onClose={onClose}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <aside className="space-y-3">
            {receipt ? (
              <ReceiptPanel receipt={receipt} />
            ) : entry ? (
              <EntryPanel entry={entry} />
            ) : null}
            {/* Depuis une écriture : le reçu choisi, en grand, quand la place le permet. */}
            {!receipt && (
              <div className="hidden lg:block">
                {previewed ? (
                  <ReceiptPanel receipt={previewed} />
                ) : (
                  <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    Choisissez un reçu pour le voir ici.
                  </p>
                )}
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-3">
            {options.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                {receipt
                  ? "Aucune écriture sans justificatif pour l’instant. Saisissez l’écriture de cette dépense, ou importez le relevé bancaire où elle apparaît : le reçu attend dans la boîte d’ici là."
                  : "La boîte à justificatifs est vide : déposez d’abord le reçu dans l’onglet Justificatifs."}
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />
                  <label htmlFor="receipt-link-search" className="sr-only">
                    {receipt ? "Rechercher une écriture" : "Rechercher un reçu"}
                  </label>
                  <Input
                    id="receipt-link-search"
                    type="search"
                    value={query}
                    data-autofocus=""
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      // Échap vide d'abord la recherche ; la fenêtre ne se
                      // ferme qu'au second appui.
                      if (event.key === "Escape" && query) {
                        event.preventDefault();
                        setQuery("");
                      }
                    }}
                    placeholder={
                      receipt ? "Libellé, tiers, montant…" : "Nom, description, montant…"
                    }
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
                <p aria-live="polite" className="text-xs font-medium text-slate-500">
                  {normalizedQuery
                    ? `${filtered.length} ${noun}${filtered.length > 1 ? "s" : ""} sur ${options.length}`
                    : receipt
                      ? `${options.length} écriture${options.length > 1 ? "s" : ""} sans justificatif`
                      : `${options.length} reçu${options.length > 1 ? "s" : ""} en attente`}
                  {filtered.length > VISIBLE_MAX &&
                    ` · ${VISIBLE_MAX} premiers affichés, affinez la recherche`}
                </p>

                <fieldset disabled={saving}>
                  <legend className="mb-2 text-sm font-bold text-slate-900">
                    {receipt
                      ? "Quelle écriture ce reçu justifie-t-il ?"
                      : "Quel reçu justifie cette écriture ?"}
                  </legend>
                  {shown.length === 0 ? (
                    <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-600">
                      {receipt ? "Aucune écriture" : "Aucun reçu"} ne correspond à « {query.trim()} ».
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shown.map((option) => (
                        <label
                          key={option.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
                            choice === option.id
                              ? "border-brand-700 bg-brand-50/60"
                              : "border-slate-200 hover:border-brand-300",
                          )}
                        >
                          <input
                            type="radio"
                            name="receipt-link-choice"
                            value={option.id}
                            checked={choice === option.id}
                            onChange={() => setChoice(option.id)}
                            className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
                          />
                          {option.entry ? (
                            <EntryOption entry={option.entry} score={option.score} />
                          ) : option.receipt ? (
                            <ReceiptOption receipt={option.receipt} score={option.score} />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              </>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-coral-200 bg-coral-50 p-3 text-sm text-coral-800"
          >
            {error}
          </p>
        )}

        <p className="text-xs leading-5 text-slate-500">
          {receipt
            ? "Le reçu devient le justificatif de l’écriture choisie et quitte la boîte."
            : `Le reçu choisi devient le justificatif de « ${entry?.label ?? ""} » et quitte la boîte.`}{" "}
          Une écriture validée peut encore recevoir le justificatif qui lui
          manque : il ne change ni son montant, ni sa date, ni son compte.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            type="button"
            icon={Paperclip}
            loading={saving}
            disabled={!chosen}
            onClick={attach}
          >
            Associer le justificatif
          </Button>
        </div>
      </div>
    </AccountingModal>
  );
}

function MatchBadge({ score }: { score: number }) {
  if (score < SCORE_CORRESPOND) return null;
  return (
    <Badge color="blue" icon={Sparkles}>
      Correspond
    </Badge>
  );
}

function EntryOption({ entry, score }: { entry: ReceiptLinkEntry; score: number }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-950 [overflow-wrap:anywhere]">
            {entry.label}
          </span>
          <Badge color={entry.status === "posted" ? "sea" : "amber"}>
            {entry.status === "posted" ? "Validée" : "Brouillon"}
          </Badge>
          <MatchBadge score={score} />
        </span>
        <span className="mt-0.5 block text-sm text-slate-600 [overflow-wrap:anywhere]">
          {formatShortDate(entry.occurredAt)} · {entry.counterparty || "Sans tiers"}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 font-extrabold tabular-nums",
          entry.type === "income" ? "text-sea-700" : "text-coral-700",
        )}
      >
        {entry.type === "income" ? "+" : "−"} {formatEuros(entry.amountCents)}
      </span>
    </span>
  );
}

function ReceiptOption({ receipt, score }: { receipt: ReceiptView; score: number }) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <ReceiptThumbnail receipt={receipt} className="h-12 w-12" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-950 [overflow-wrap:anywhere]">
            {receipt.label || receipt.filename}
          </span>
          <MatchBadge score={score} />
        </span>
        {receipt.label && (
          <span className="mt-0.5 block text-xs text-slate-500 [overflow-wrap:anywhere]">
            {receipt.filename}
          </span>
        )}
        <span className="mt-0.5 block text-sm text-slate-600">{receiptFacts(receipt)}</span>
      </span>
    </span>
  );
}

function ReceiptPanel({ receipt }: { receipt: ReceiptView }) {
  return (
    <div className="flex gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 lg:flex-col">
      <ReceiptThumbnail
        receipt={receipt}
        fit="contain"
        className="h-16 w-16 bg-white lg:h-64 lg:w-full"
      />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Reçu
        </p>
        <p className="mt-0.5 font-bold text-slate-950 [overflow-wrap:anywhere]">
          {receipt.label || receipt.filename}
        </p>
        {receipt.label && (
          <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">{receipt.filename}</p>
        )}
        <p className="mt-1 text-sm text-slate-600">{receiptFacts(receipt)}</p>
        <a
          href={receipt.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Ouvrir le reçu
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
        {receipt.amountCents === null && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Renseignez son montant dans la boîte : l’écriture du même montant
            sera proposée en premier.
          </p>
        )}
      </div>
    </div>
  );
}

function EntryPanel({ entry }: { entry: ReceiptLinkEntry }) {
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        Écriture sans justificatif
      </p>
      <p className="mt-1 font-bold text-slate-950 [overflow-wrap:anywhere]">{entry.label}</p>
      <p
        className={cn(
          "mt-1 font-extrabold tabular-nums",
          entry.type === "income" ? "text-sea-700" : "text-coral-700",
        )}
      >
        {entry.type === "income" ? "+" : "−"} {formatEuros(entry.amountCents)}
      </p>
      <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">
        {formatShortDate(entry.occurredAt)} · {entry.counterparty || "Sans tiers"}
      </p>
      <div className="mt-2">
        <Badge color={entry.status === "posted" ? "sea" : "amber"}>
          {entry.status === "posted" ? "Validée" : "Brouillon"}
        </Badge>
      </div>
    </div>
  );
}
