"use client";

import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  FileUp,
  Inbox,
  Loader2,
  Paperclip,
  ReceiptText,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, Field, Input } from "@/components/ui";
import {
  ecrituresPourRecu,
  RECEIPTS_PER_UPLOAD,
  type ReceiptView,
} from "@/lib/accounting/receipts";
import { api } from "@/lib/client";
import { formatShortDate, toDateInput } from "@/lib/dates";
import { formatEuros, MONTANT_MAX_CENTIMES } from "@/lib/money";
import { useMutationError } from "@/lib/use-mutation-error";
import { cn } from "@/lib/utils";

import {
  type ReceiptLinkEntry,
  ReceiptLinkDialog,
  SCORE_CORRESPOND,
} from "./receipt-link-dialog";
import { fileSize, ReceiptThumbnail } from "./receipt-preview";

/**
 * PDF ou photo : ce qu'on scanne ou photographie d'un ticket, d'une facture.
 * Les mêmes formats que le serveur, qui refuse tout autre fichier (415).
 */
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ACCEPT = [
  ...ACCEPTED_EXTENSIONS,
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");
/** Envois menés de front : assez pour ne pas attendre, sans saturer le serveur. */
const PARALLEL_UPLOADS = 3;

interface Upload {
  key: string;
  name: string;
  size: number;
  status: "waiting" | "uploading" | "done" | "error";
  error: string | null;
}

function isAccepted(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Plafond lisible : « 15 Mo », « 9,5 Mo », « 500 Ko ». */
function sizeLimit(bytes: number) {
  return fileSize(bytes).replace(/,0 Mo$/, " Mo");
}

/** Un fichier par requête : chaque reçu a son propre état, et un refus n'emporte pas les autres. */
async function uploadReceipt(file: File, maxBytes: number): Promise<ReceiptView[]> {
  const body = new FormData();
  body.append("files", file);
  let response: Response;
  try {
    response = await fetch("/api/accounting/receipts", {
      method: "POST",
      body,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Envoi interrompu : vérifiez la connexion et réessayez.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    items?: ReceiptView[];
  };
  if (!response.ok || !payload.items) {
    // Le motif du serveur d'abord ; à défaut (un proxy qui répond sans JSON),
    // celui que dit le code de la réponse.
    throw new Error(
      payload.error ||
        (response.status === 413
          ? `Fichier trop volumineux : ${sizeLimit(maxBytes)} au plus.`
          : response.status === 415
            ? "Format refusé : PDF, JPG, PNG ou WebP uniquement."
            : "Envoi du reçu impossible."),
    );
  }
  return payload.items;
}

/**
 * Onglet Justificatifs : on y dépose les reçus dès qu'on les a, puis on les
 * associe à leur écriture quand elle existe — saisie à la main ou créée par
 * l'import d'un relevé. Associé, le reçu devient le justificatif de
 * l'écriture et quitte la boîte.
 */
export function ReceiptsInbox({
  receipts,
  entries,
  maxFileBytes,
}: {
  receipts: ReceiptView[];
  entries: ReceiptLinkEntry[];
  /** Plafond du serveur pour un fichier téléversé, en octets. */
  maxFileBytes: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [refusals, setRefusals] = useState<string[]>([]);
  const [linking, setLinking] = useState<ReceiptView | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReceiptView | null>(null);
  const [deleting, setDeleting] = useState(false);

  // L'écriture la plus proche de chaque reçu, quand elle correspond : un
  // indice posé sur la carte, avant même d'ouvrir la fenêtre d'association.
  const likelyEntries = useMemo(() => {
    const result = new Map<string, ReceiptLinkEntry>();
    for (const receipt of receipts) {
      const [best] = ecrituresPourRecu(receipt, entries);
      if (best && best.score >= SCORE_CORRESPOND) result.set(receipt.id, best.ecriture);
    }
    return result;
  }, [entries, receipts]);

  async function addFiles(list: FileList | File[]) {
    if (uploading) return;
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const errors: string[] = [];
    const accepted: { item: Upload; file: File }[] = [];
    for (const file of incoming) {
      if (!isAccepted(file)) {
        errors.push(`« ${file.name} » n’est ni un PDF ni une photo (JPG, PNG, WebP).`);
        continue;
      }
      if (file.size === 0) {
        errors.push(`« ${file.name} » est vide.`);
        continue;
      }
      if (file.size > maxFileBytes) {
        errors.push(`« ${file.name} » dépasse ${sizeLimit(maxFileBytes)}.`);
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (accepted.some(({ item }) => item.key === key)) continue;
      if (accepted.length >= RECEIPTS_PER_UPLOAD) {
        errors.push(
          `Au plus ${RECEIPTS_PER_UPLOAD} reçus à la fois : « ${file.name} » n’a pas été envoyé.`,
        );
        continue;
      }
      accepted.push({
        item: { key, name: file.name, size: file.size, status: "waiting", error: null },
        file,
      });
    }
    setRefusals(errors);
    // Un nouveau dépôt remplace la liste du précédent (ses échecs compris).
    setUploads(accepted.map(({ item }) => item));
    if (accepted.length === 0) return;

    setUploading(true);
    const update = (key: string, patch: Partial<Upload>) =>
      setUploads((current) =>
        current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
      );
    let next = 0;
    let sent = 0;
    async function worker() {
      while (next < accepted.length) {
        const { item, file } = accepted[next];
        next += 1;
        update(item.key, { status: "uploading" });
        try {
          await uploadReceipt(file, maxFileBytes);
          sent += 1;
          update(item.key, { status: "done" });
        } catch (error) {
          update(item.key, { status: "error", error: (error as Error).message });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_UPLOADS, accepted.length) }, worker),
    );
    setUploading(false);

    const failed = accepted.length - sent;
    if (sent > 0) {
      toast(
        sent === 1 ? "Reçu déposé dans la boîte." : `${sent} reçus déposés dans la boîte.`,
      );
      router.refresh();
    }
    if (failed > 0) {
      toast(
        failed === 1
          ? "Un reçu n’a pas pu être envoyé."
          : `${failed} reçus n’ont pas pu être envoyés.`,
        "error",
      );
    }
    // Les reçus envoyés rejoignent la liste ci-dessous ; seuls les échecs
    // restent affichés, avec leur motif.
    setUploads((current) => current.filter((item) => item.status === "error"));
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/accounting/receipts/${pendingDelete.id}`, { method: "DELETE" });
      toast("Reçu supprimé.");
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const finished = uploads.filter(
    (item) => item.status === "done" || item.status === "error",
  ).length;
  const progress = uploading
    ? `Envoi des reçus : ${finished} sur ${uploads.length}…`
    : "";

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            <ReceiptText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Boîte à justificatifs</h2>
            <p className="mt-1 text-sm text-slate-600">
              Déposez les tickets et factures dès que vous les avez, même si
              la dépense n’est pas encore saisie. Quand l’écriture existe —
              saisie à la main ou créée par l’import d’un relevé —,
              associez-lui son reçu : il en devient le justificatif.
            </p>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) void addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "mt-5 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
            dragging
              ? "border-brand-700 bg-brand-50"
              : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/50",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-white">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-6 w-6" aria-hidden="true" />
            )}
          </span>
          <span className="font-bold text-slate-900">Déposez vos reçus ici</span>
          <span className="text-sm text-slate-600">
            ou{" "}
            <span className="font-semibold text-brand-700 underline">
              choisissez des fichiers
            </span>
          </span>
          <span className="text-xs text-slate-500">
            PDF ou photo (JPG, PNG, WebP) · jusqu’à {RECEIPTS_PER_UPLOAD} reçus à
            la fois · {sizeLimit(maxFileBytes)} chacun
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files) void addFiles(Array.from(files));
              // Permet de rechoisir le même fichier après un échec.
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </label>

        {refusals.length > 0 && (
          <ul
            role="alert"
            className="mt-4 space-y-1 rounded-xl border-2 border-coral-200 bg-coral-50 p-3 text-sm text-coral-800"
          >
            {refusals.map((refusal) => (
              <li key={refusal} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {refusal}
              </li>
            ))}
          </ul>
        )}

        {uploads.length > 0 && (
          <ul aria-label="Reçus en cours d’envoi" className="mt-4 space-y-2">
            {uploads.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 bg-white px-3 py-2.5",
                  item.status === "error" ? "border-coral-200" : "border-slate-200",
                )}
              >
                <FileText className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                  <p
                    className={cn(
                      "text-xs",
                      item.status === "error" ? "text-coral-700" : "text-slate-500",
                    )}
                  >
                    {fileSize(item.size)} ·{" "}
                    {item.status === "waiting"
                      ? "en attente"
                      : item.status === "uploading"
                        ? "envoi…"
                        : item.status === "done"
                          ? "déposé"
                          : item.error}
                  </p>
                </div>
                {item.status === "uploading" ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-brand-700"
                    aria-hidden="true"
                  />
                ) : item.status === "done" ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-sea-600" aria-hidden="true" />
                ) : item.status === "error" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setUploads((current) => current.filter((other) => other.key !== item.key))
                    }
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-coral-50 hover:text-coral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={`Retirer ${item.name} de la liste`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "mt-3 flex items-center gap-2 text-sm font-semibold text-brand-800",
            !progress && "sr-only",
          )}
        >
          {progress}
        </p>
      </Card>

      {receipts.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Aucun reçu en attente"
          description="Les reçus déposés attendent ici leur écriture. Associez chacun dès que l’écriture existe, saisie à la main ou créée par l’import d’un relevé bancaire."
        />
      ) : (
        <section aria-labelledby="receipts-pending-title" className="space-y-3">
          <h3 id="receipts-pending-title" className="text-sm font-medium text-slate-500">
            {receipts.length} reçu{receipts.length > 1 ? "s" : ""} en attente
            d’écriture
          </h3>
          <ul className="grid gap-4 xl:grid-cols-2">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="min-w-0">
                <ReceiptCard
                  key={`${receipt.id}:${receipt.version}`}
                  receipt={receipt}
                  likelyEntry={likelyEntries.get(receipt.id) ?? null}
                  onAttach={() => setLinking(receipt)}
                  onDelete={() => setPendingDelete(receipt)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {linking && (
        <ReceiptLinkDialog
          mode="receipt"
          // Le reçu à jour (montant complété…), tant qu'il est dans la boîte.
          receipt={receipts.find((receipt) => receipt.id === linking.id) ?? linking}
          entries={entries}
          onClose={() => setLinking(null)}
          onAttached={() => {
            setLinking(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer ce reçu ?"
        description={
          pendingDelete
            ? `Le reçu « ${pendingDelete.label || pendingDelete.filename} » sera définitivement supprimé de la boîte à justificatifs.`
            : ""
        }
        confirmLabel="Supprimer le reçu"
        loading={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

/** Montant en centimes → valeur du champ « 12.50 » (le navigateur l'affiche « 12,50 »). */
function amountInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function ReceiptCard({
  receipt,
  likelyEntry,
  onAttach,
  onDelete,
}: {
  receipt: ReceiptView;
  likelyEntry: ReceiptLinkEntry | null;
  onAttach: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const onError = useMutationError();
  const initial = {
    amount: amountInput(receipt.amountCents),
    date: receipt.receiptDate ? toDateInput(receipt.receiptDate) : "",
    label: receipt.label ?? "",
  };
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [label, setLabel] = useState(initial.label);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty =
    amount !== initial.amount || date !== initial.date || label.trim() !== initial.label;

  const prefix = `receipt-${receipt.id}`;
  const titleId = `${prefix}-title`;
  const formId = `${prefix}-form`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Même conversion que le formulaire d'écriture : des euros saisis, des
    // centimes enregistrés.
    const amountCents = amount.trim() === "" ? null : Math.round(Number(amount) * 100);
    if (
      amountCents !== null &&
      (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > MONTANT_MAX_CENTIMES)
    ) {
      setAmountError(
        `Un montant positif, jusqu’à ${formatEuros(MONTANT_MAX_CENTIMES)}, ou rien.`,
      );
      document.getElementById(`${prefix}-amount`)?.focus();
      return;
    }
    setAmountError(null);
    setSaving(true);
    try {
      await api<{ receipt: ReceiptView }>(`/api/accounting/receipts/${receipt.id}`, {
        method: "PATCH",
        body: {
          label: label.trim() || null,
          amountCents,
          receiptDate: date || null,
          version: receipt.version,
        },
      });
      toast("Reçu mis à jour.");
      router.refresh();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-full p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <a
          href={receipt.fileUrl}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden="true"
          className="shrink-0"
        >
          <ReceiptThumbnail receipt={receipt} className="h-16 w-16 sm:h-20 sm:w-20" />
        </a>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="font-bold text-slate-950 [overflow-wrap:anywhere]">
            {receipt.filename}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Déposé le {formatShortDate(receipt.createdAt)} · {fileSize(receipt.sizeBytes)}
          </p>
          <a
            href={receipt.fileUrl}
            target="_blank"
            rel="noreferrer"
            aria-describedby={titleId}
            className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Ouvrir
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </div>
      </div>

      {likelyEntry && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Écriture probable : « {likelyEntry.label} » du{" "}
            {formatShortDate(likelyEntry.occurredAt)},{" "}
            {formatEuros(likelyEntry.amountCents)}.
          </span>
        </p>
      )}

      <form
        id={formId}
        onSubmit={save}
        aria-describedby={titleId}
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,10rem)_minmax(0,1fr)]"
      >
        <Field label="Montant (€)" htmlFor={`${prefix}-amount`} error={amountError ?? undefined}>
          <Input
            id={`${prefix}-amount`}
            type="number"
            min="0.01"
            max={MONTANT_MAX_CENTIMES / 100}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountError(null);
            }}
            placeholder="0,00"
            disabled={saving}
            aria-invalid={amountError ? true : undefined}
          />
        </Field>
        <Field label="Date du reçu" htmlFor={`${prefix}-date`}>
          <Input
            id={`${prefix}-date`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="Description" htmlFor={`${prefix}-label`}>
          <Input
            id={`${prefix}-label`}
            value={label}
            maxLength={200}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex. Courses kermesse"
            disabled={saving}
          />
        </Field>
      </form>

      <div className="mt-4 flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={Trash2}
          className="hover:!bg-coral-50 hover:!text-coral-800"
          onClick={onDelete}
          disabled={saving}
          aria-describedby={titleId}
        >
          Supprimer
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="submit"
            form={formId}
            size="sm"
            variant="outline"
            icon={Save}
            loading={saving}
            disabled={!dirty}
            aria-describedby={titleId}
          >
            Enregistrer
          </Button>
          <Button
            type="button"
            size="sm"
            icon={Paperclip}
            onClick={onAttach}
            disabled={saving}
            aria-describedby={titleId}
          >
            Associer à une écriture
          </Button>
        </div>
      </div>
    </Card>
  );
}
