"use client";

import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Paperclip,
  Search,
  Sigma,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Input } from "@/components/ui";
import {
  type EcritureCandidate,
  ecrituresPourRecu,
  etatDuCompte,
  type JustificatifAssocie,
  justificatifsPourEcriture,
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

/** Type d'un fichier déjà associé, d'après son nom : de quoi choisir l'aperçu. */
function contentTypeFromName(filename: string) {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png" || extension === "webp" || extension === "gif") {
    return `image/${extension}`;
  }
  return "application/octet-stream";
}

type ReceiptLinkDialogProps = {
  onClose: () => void;
  /** Le justificatif est associé : la fenêtre se ferme, la page se recharge. */
  onAttached: () => void;
} & (
  | {
      /**
       * Depuis la boîte : on cherche la ou les écritures que ce reçu
       * justifie (un ticket réglé en deux fois en justifie deux).
       */
      mode: "receipt";
      receipt: ReceiptView;
      entries: ReceiptLinkEntry[];
    }
  | {
      /**
       * Depuis une écriture sans justificatif : on cherche son reçu dans la
       * boîte, ou le justificatif qu'une autre écriture porte déjà.
       */
      mode: "entry";
      entry: ReceiptLinkEntry;
      receipts: ReceiptView[];
      /** Toutes les écritures : celles qui ont un justificatif le proposent. */
      entries: ReceiptLinkEntry[];
    }
);

type LinkOption = {
  key: string;
  score: number;
  haystack: string;
} & (
  | { kind: "entry"; entry: ReceiptLinkEntry }
  | { kind: "receipt"; receipt: ReceiptView }
  | { kind: "shared"; shared: JustificatifAssocie<ReceiptLinkEntry> }
);

/**
 * Associe un reçu de la boîte à une ou plusieurs écritures. Deux points de
 * départ : le reçu (on coche parmi les écritures sans justificatif, et le
 * total des écritures cochées se compare au reçu — le compte y est, ou non)
 * ou l'écriture (on choisit parmi les reçus en attente, ou parmi les
 * justificatifs déjà associés à d'autres écritures). Les propositions les
 * plus proches — même montant, date voisine, mots communs — viennent en tête.
 */
export function ReceiptLinkDialog(props: ReceiptLinkDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const { onClose, onAttached } = props;
  const receipt = props.mode === "receipt" ? props.receipt : null;
  const entry = props.mode === "entry" ? props.entry : null;
  const receipts = props.mode === "entry" ? props.receipts : null;
  const entries = props.entries;

  const options = useMemo<LinkOption[]>(() => {
    if (receipt) {
      return ecrituresPourRecu(receipt, entries).map(({ ecriture, score }) => ({
        key: ecriture.id,
        kind: "entry" as const,
        score,
        haystack: normalize(
          `${ecriture.label} ${ecriture.counterparty ?? ""} ${amountText(ecriture.amountCents)}`,
        ),
        entry: ecriture,
      }));
    }
    if (entry && receipts) {
      return [
        ...recusPourEcriture(entry, receipts).map(({ recu, score }) => ({
          key: `recu:${recu.id}`,
          kind: "receipt" as const,
          score,
          haystack: normalize(
            `${recu.filename} ${recu.label ?? ""} ${
              recu.amountCents !== null ? amountText(recu.amountCents) : ""
            }`,
          ),
          receipt: recu,
        })),
        ...justificatifsPourEcriture(entry, entries).map(({ justificatif, score }) => ({
          key: `fichier:${justificatif.url}`,
          kind: "shared" as const,
          score,
          haystack: normalize(
            `${justificatif.filename} ${justificatif.ecritures
              .map((e) => `${e.label} ${e.counterparty ?? ""} ${amountText(e.amountCents)}`)
              .join(" ")} ${amountText(justificatif.totalCents)}`,
          ),
          shared: justificatif,
        })),
      ];
    }
    return [];
  }, [entries, entry, receipt, receipts]);

  const [query, setQuery] = useState("");
  // Une seule proposition qui correspond : déjà choisie, il reste à confirmer.
  // Depuis la boîte on peut en cocher plusieurs ; depuis une écriture, on en
  // choisit une.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const boxOptions = options.filter((option) => option.kind !== "shared");
    return boxOptions.length > 0 &&
      boxOptions[0].score >= SCORE_CORRESPOND &&
      (boxOptions.length === 1 || boxOptions[1].score < SCORE_CORRESPOND)
      ? new Set([boxOptions[0].key])
      : new Set();
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Après un rechargement (écriture justifiée entre-temps, reçu supprimé), un
  // choix peut ne plus figurer parmi les propositions : il ne compte plus.
  const chosen = options.filter((option) => selected.has(option.key));
  const single = entry ? (chosen[0] ?? null) : null;

  const normalizedQuery = normalize(query.trim());
  const filtered = normalizedQuery
    ? options.filter((option) => option.haystack.includes(normalizedQuery))
    : options;
  const shown = filtered.slice(0, VISIBLE_MAX);
  // Les choix restent visibles même quand la recherche les écarte : on voit
  // toujours ce que le bouton va associer.
  for (const option of [...chosen].reverse()) {
    if (!shown.includes(option)) shown.unshift(option);
  }
  const shownBox = shown.filter((option) => option.kind !== "shared");
  const shownShared = shown.filter((option) => option.kind === "shared");
  const boxCount = options.filter((option) => option.kind !== "shared").length;
  const sharedCount = options.length - boxCount;

  const chosenEntries = chosen.flatMap((option) =>
    option.kind === "entry" ? [option.entry] : [],
  );
  const totalCents = chosenEntries.reduce((sum, e) => sum + e.amountCents, 0);

  const previewed = receipt ?? (single?.kind === "receipt" ? single.receipt : null);
  const noun = receipt ? "écriture" : "justificatif";

  function toggle(key: string) {
    setSelected((current) => {
      if (entry) return new Set([key]);
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function attach() {
    if (chosen.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      if (receipt) {
        await api<{ ok: true; entryIds: string[] }>(
          `/api/accounting/receipts/${receipt.id}/attach`,
          { body: { entryIds: chosenEntries.map((e) => e.id) } },
        );
        toast(
          chosenEntries.length > 1
            ? `Justificatif associé aux ${chosenEntries.length} écritures.`
            : "Justificatif associé.",
        );
      } else if (entry && single?.kind === "receipt") {
        await api<{ ok: true; entryIds: string[] }>(
          `/api/accounting/receipts/${single.receipt.id}/attach`,
          { body: { entryIds: [entry.id] } },
        );
        toast("Justificatif associé.");
      } else if (entry && single?.kind === "shared") {
        await api<{ ok: true; entryId: string }>(
          `/api/accounting/entries/${entry.id}/shared-attachment`,
          { body: { sourceEntryId: single.shared.ecritures[0].id } },
        );
        toast(
          `Justificatif partagé : il couvre maintenant ${single.shared.ecritures.length + 1} écritures.`,
        );
      }
      onAttached();
    } catch (caught) {
      const message = (caught as Error).message;
      setSaving(false);
      const status = caught instanceof ApiError ? caught.status : null;
      // Le reçu ou l'écriture de départ a disparu, ou l'écriture de départ a
      // reçu un justificatif entre-temps : la fenêtre ne vise plus rien de
      // possible, une nouvelle tentative échouerait pareil. On la ferme et on
      // recharge.
      if (
        (status === 404 &&
          (props.mode === "entry" ||
            message !== "L’une des écritures choisies n’existe plus.")) ||
        (status === 409 && message === "Cette écriture a déjà un justificatif.")
      ) {
        toast(message, "error");
        onClose();
        router.refresh();
        return;
      }
      setError(message);
      // Une écriture cochée a reçu un justificatif ou disparu entre-temps, le
      // justificatif partagé n'existe plus : la page rechargée les retire des
      // propositions, et le choix restant est à vérifier.
      if (status === 404 || status === 409) {
        if (entry) setSelected(new Set());
        router.refresh();
      }
    }
  }

  const footerNote = receipt
    ? "Le reçu devient le justificatif de chaque écriture cochée et quitte la boîte. Un ticket réglé en deux fois, une facture répartie sur deux catégories : cochez toutes les écritures qu’il couvre."
    : single?.kind === "shared"
      ? `« ${entry?.label ?? ""} » partagera le justificatif des écritures déjà associées.`
      : `Le reçu choisi devient le justificatif de « ${entry?.label ?? ""} » et quitte la boîte.`;

  return (
    <AccountingModal
      title={receipt ? "Associer à des écritures" : "Associer un justificatif"}
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
            {/* Depuis une écriture : le justificatif choisi, en grand, quand la place le permet. */}
            {!receipt && (
              <div className="hidden lg:block">
                {single?.kind === "shared" ? (
                  <SharedPanel shared={single.shared} />
                ) : previewed ? (
                  <ReceiptPanel receipt={previewed} />
                ) : (
                  <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    Choisissez un justificatif pour le voir ici.
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
                  : "Aucun justificatif à proposer : déposez d’abord le reçu dans l’onglet Justificatifs."}
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />
                  <label htmlFor="receipt-link-search" className="sr-only">
                    {receipt ? "Rechercher une écriture" : "Rechercher un justificatif"}
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
                      : [
                          boxCount > 0 &&
                            `${boxCount} reçu${boxCount > 1 ? "s" : ""} en attente`,
                          sharedCount > 0 &&
                            `${sharedCount} justificatif${sharedCount > 1 ? "s" : ""} déjà associé${sharedCount > 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  {filtered.length > VISIBLE_MAX &&
                    ` · ${VISIBLE_MAX} premiers affichés, affinez la recherche`}
                </p>

                <fieldset disabled={saving}>
                  <legend className="mb-2 text-sm font-bold text-slate-900">
                    {receipt
                      ? "Quelles écritures ce reçu justifie-t-il ?"
                      : "Quel justificatif pour cette écriture ?"}
                  </legend>
                  {receipt && (
                    <p className="-mt-1 mb-2 text-xs leading-5 text-slate-500">
                      Cochez-en plusieurs si le reçu couvre plusieurs écritures :
                      leur total doit retrouver celui du reçu.
                    </p>
                  )}
                  {shown.length === 0 ? (
                    <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-600">
                      {receipt ? "Aucune écriture" : "Aucun justificatif"} ne correspond à « {query.trim()} ».
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {shownBox.length > 0 && (
                        <div className="space-y-2">
                          {!receipt && shownShared.length > 0 && (
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                              Dans la boîte
                            </p>
                          )}
                          {shownBox.map((option) => (
                            <OptionRow
                              key={option.key}
                              option={option}
                              multiple={Boolean(receipt)}
                              checked={selected.has(option.key)}
                              onToggle={() => toggle(option.key)}
                            />
                          ))}
                        </div>
                      )}
                      {shownShared.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                            Déjà associés à une autre écriture
                          </p>
                          {shownShared.map((option) => (
                            <OptionRow
                              key={option.key}
                              option={option}
                              multiple={false}
                              checked={selected.has(option.key)}
                              onToggle={() => toggle(option.key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </fieldset>
              </>
            )}
          </div>
        </div>

        {receipt && options.length > 0 && (
          <SelectionSummary
            count={chosenEntries.length}
            totalCents={totalCents}
            receiptAmountCents={receipt.amountCents}
          />
        )}
        {entry && single && <EntryChoiceSummary entry={entry} option={single} />}

        {error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-coral-200 bg-coral-50 p-3 text-sm text-coral-800"
          >
            {error}
          </p>
        )}

        <p className="text-xs leading-5 text-slate-500">
          {footerNote} Une écriture validée peut encore recevoir le justificatif
          qui lui manque : il ne change ni son montant, ni sa date, ni son compte.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            type="button"
            icon={Paperclip}
            loading={saving}
            disabled={chosen.length === 0}
            onClick={attach}
          >
            {receipt && chosenEntries.length > 1
              ? `Associer aux ${chosenEntries.length} écritures`
              : single?.kind === "shared"
                ? "Partager ce justificatif"
                : "Associer le justificatif"}
          </Button>
        </div>
      </div>
    </AccountingModal>
  );
}

/** Un justificatif déjà associé, vu comme un reçu pour son aperçu. */
function sharedAsReceipt(shared: JustificatifAssocie<ReceiptLinkEntry>) {
  return {
    fileUrl: shared.url,
    filename: shared.filename,
    contentType: contentTypeFromName(shared.filename),
  };
}

function OptionRow({
  option,
  multiple,
  checked,
  onToggle,
}: {
  option: LinkOption;
  multiple: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
        checked ? "border-brand-700 bg-brand-50/60" : "border-slate-200 hover:border-brand-300",
      )}
    >
      <input
        type={multiple ? "checkbox" : "radio"}
        name="receipt-link-choice"
        value={option.key}
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
      />
      {option.kind === "entry" ? (
        <EntryOption entry={option.entry} score={option.score} />
      ) : option.kind === "receipt" ? (
        <ReceiptOption receipt={option.receipt} score={option.score} />
      ) : (
        <SharedOption shared={option.shared} />
      )}
    </label>
  );
}

/**
 * Le total des écritures cochées face au montant du reçu : le compte y est,
 * il manque une partie, ou la sélection dépasse le reçu.
 */
function SelectionSummary({
  count,
  totalCents,
  receiptAmountCents,
}: {
  count: number;
  totalCents: number;
  receiptAmountCents: number | null;
}) {
  if (count === 0) return null;
  const etat = etatDuCompte(receiptAmountCents, totalCents);
  const selection = `${count} écriture${count > 1 ? "s" : ""} cochée${count > 1 ? "s" : ""} · ${formatEuros(totalCents)}`;
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 p-3 text-sm",
        etat.etat === "juste"
          ? "border-sea-200 bg-sea-50 text-sea-900"
          : etat.etat === "inconnu"
            ? "border-slate-200 bg-slate-50 text-slate-700"
            : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {etat.etat === "juste" ? (
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : etat.etat === "inconnu" ? (
        <Sigma className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <p>
        <span className="font-bold">{selection}</span>
        {etat.etat === "juste" && (
          <> — le compte y est : c’est le montant du reçu.</>
        )}
        {etat.etat === "manque" && (
          <>
            {" "}— il manque {formatEuros(etat.ecartCents)} pour atteindre les{" "}
            {formatEuros(receiptAmountCents ?? 0)} du reçu. Cochez l’autre partie de la
            dépense, ou associez quand même si le reçu couvre aussi autre chose.
          </>
        )}
        {etat.etat === "depasse" && (
          <>
            {" "}— {formatEuros(etat.ecartCents)} de plus que les{" "}
            {formatEuros(receiptAmountCents ?? 0)} du reçu. Vérifiez les écritures cochées.
          </>
        )}
        {etat.etat === "inconnu" && (
          <> — renseignez le montant du reçu dans la boîte pour vérifier que le compte y est.</>
        )}
      </p>
    </div>
  );
}

/** Depuis une écriture : ce que le justificatif choisi couvrira. */
function EntryChoiceSummary({
  entry,
  option,
}: {
  entry: ReceiptLinkEntry;
  option: LinkOption;
}) {
  if (option.kind === "shared") {
    const total = option.shared.totalCents + entry.amountCents;
    const count = option.shared.ecritures.length + 1;
    return (
      <p
        aria-live="polite"
        className="flex items-start gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      >
        <Sigma className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Avec cette écriture, le justificatif couvrira{" "}
          <span className="font-bold">
            {count} écritures pour {formatEuros(total)}
          </span>
          . Le compte y est si c’est le montant du reçu.
        </span>
      </p>
    );
  }
  if (option.kind !== "receipt") return null;
  const etat = etatDuCompte(option.receipt.amountCents, entry.amountCents);
  if (etat.etat === "juste" || etat.etat === "inconnu") return null;
  return (
    <p
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {etat.etat === "manque" ? (
          <>
            Ce reçu fait {formatEuros(option.receipt.amountCents ?? 0)} : cette écriture
            n’en couvre que {formatEuros(entry.amountCents)}. Il restera{" "}
            {formatEuros(etat.ecartCents)} à justifier — associez ensuite ce même
            justificatif à l’autre partie de la dépense, avec « Associer un
            justificatif » sur son écriture.
          </>
        ) : (
          <>
            L’écriture dépasse ce reçu de {formatEuros(etat.ecartCents)} : vérifiez
            qu’il s’agit bien du bon reçu.
          </>
        )}
      </span>
    </p>
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

function SharedOption({ shared }: { shared: JustificatifAssocie<ReceiptLinkEntry> }) {
  const count = shared.ecritures.length;
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <ReceiptThumbnail receipt={sharedAsReceipt(shared)} className="h-12 w-12" />
      <span className="min-w-0">
        <span className="block font-bold text-slate-950 [overflow-wrap:anywhere]">
          {shared.filename}
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">
          {count > 1
            ? `Commun à ${count} écritures · ${formatEuros(shared.totalCents)}`
            : `Justificatif de ${formatEuros(shared.totalCents)}`}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500 [overflow-wrap:anywhere]">
          {shared.ecritures
            .map((e) => `${e.label} (${formatShortDate(e.occurredAt)})`)
            .join(" · ")}
        </span>
      </span>
    </span>
  );
}

function SharedPanel({ shared }: { shared: JustificatifAssocie<ReceiptLinkEntry> }) {
  return (
    <div className="flex gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 lg:flex-col">
      <ReceiptThumbnail
        receipt={sharedAsReceipt(shared)}
        fit="contain"
        className="h-16 w-16 bg-white lg:h-64 lg:w-full"
      />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Justificatif déjà associé
        </p>
        <p className="mt-0.5 font-bold text-slate-950 [overflow-wrap:anywhere]">
          {shared.filename}
        </p>
        <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
          {shared.ecritures.map((e) => (
            <li key={e.id} className="[overflow-wrap:anywhere]">
              {e.label} · {formatEuros(e.amountCents)}
            </li>
          ))}
        </ul>
        <a
          href={shared.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Ouvrir le justificatif
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      </div>
    </div>
  );
}
