"use client";

import { Check, Link2, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button } from "@/components/ui";
import type { BankLinkOptions } from "@/lib/banking/import-types";
import { api } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

import { AccountingModal } from "./modal";

/** Date « AAAA-MM-JJ » du relevé en « JJ/MM/AAAA ». */
function day(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Rapprochement après coup : l'écriture créée par un import est en fait une
 * écriture déjà saisie (un paiement par carte avec son ticket en pièce
 * jointe…). On choisit laquelle ; l'opération du relevé passe sur elle, et le
 * brouillon importé disparaît. L'écriture choisie garde tout ce qu'elle a.
 */
export function BankLinkDialog({
  entry,
  onClose,
  onLinked,
}: {
  entry: { id: string; label: string };
  onClose: () => void;
  onLinked: () => void;
}) {
  const toast = useToast();
  const [options, setOptions] = useState<BankLinkOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ options: BankLinkOptions }>(`/api/accounting/entries/${entry.id}/bank-link`, {
      method: "GET",
    })
      .then(({ options: loaded }) => {
        if (cancelled) return;
        setOptions(loaded);
        // Une seule écriture possible : déjà choisie, il reste à confirmer.
        if (loaded.candidates.length === 1) setChoice(loaded.candidates[0].entryId);
      })
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  async function link() {
    if (!choice || !options) return;
    setSaving(true);
    try {
      await api(`/api/accounting/entries/${entry.id}/bank-link`, {
        body: { targetEntryId: choice },
      });
      const target = options.candidates.find((c) => c.entryId === choice);
      toast(
        `Opération du relevé rattachée à « ${target?.label ?? "l’écriture choisie"} ». Le brouillon importé a été supprimé.`,
      );
      onLinked();
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  const line = options?.line;
  return (
    <AccountingModal
      title="Rattacher à une écriture existante"
      eyebrow="Rapprochement bancaire"
      busy={saving}
      onClose={onClose}
    >
      <div className="space-y-5 p-5 sm:p-6">
        {line ? (
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Opération du relevé
            </p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 font-bold text-slate-950 [overflow-wrap:anywhere]">{line.label}</p>
              <p
                className={cn(
                  "font-extrabold tabular-nums",
                  line.direction === "credit" ? "text-sea-700" : "text-coral-700",
                )}
              >
                {line.direction === "credit" ? "+" : "−"} {formatEuros(line.amountCents)}
              </p>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Passée le {day(line.operationDate)}
              {line.purchaseDate && ` · achat par carte du ${day(line.purchaseDate)}`}
              {line.statementDate && ` · relevé du ${day(line.statementDate)}`}
            </p>
            {line.details.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">
                {line.details.join(" · ")}
              </p>
            )}
          </div>
        ) : (
          !error && (
            <p className="text-sm text-slate-500" aria-live="polite">
              Recherche des écritures possibles…
            </p>
          )
        )}

        {options && options.candidates.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
            Aucune écriture saisie ne correspond : il en faut une de même sens
            et de même montant, datée à six semaines près, sans compte ou sur
            le compte du relevé, et pas déjà rattachée à une autre opération.
            Vous pouvez aussi garder l’écriture importée et y joindre le
            justificatif.
          </p>
        )}

        {options && options.candidates.length > 0 && (
          <fieldset disabled={saving}>
            <legend className="mb-2 text-sm font-bold text-slate-900">
              Quelle écriture correspond à cette opération ?
            </legend>
            <div className="space-y-2">
              {options.candidates.map((candidate, index) => (
                <label
                  key={candidate.entryId}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
                    choice === candidate.entryId
                      ? "border-brand-700 bg-brand-50/60"
                      : "border-slate-200 hover:border-brand-300",
                  )}
                >
                  <input
                    type="radio"
                    name="bank-link-target"
                    value={candidate.entryId}
                    checked={choice === candidate.entryId}
                    onChange={() => setChoice(candidate.entryId)}
                    data-autofocus={index === 0 ? "" : undefined}
                    className="mt-1 h-4 w-4 accent-brand-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-950 [overflow-wrap:anywhere]">
                        {candidate.label}
                      </span>
                      <Badge color={candidate.status === "posted" ? "sea" : "amber"}>
                        {candidate.status === "posted" ? "Validée" : "Brouillon"}
                      </Badge>
                      {candidate.hasAttachment && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          Justificatif
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {formatShortDate(candidate.occurredAt)} · {formatEuros(candidate.amountCents)}
                      {" · "}
                      {candidate.categoryName ?? "Sans catégorie"}
                      {" · "}
                      {candidate.accountName ?? "Sans compte"}
                      {candidate.counterparty && ` · ${candidate.counterparty}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="rounded-xl border-2 border-coral-200 bg-coral-50 p-3 text-sm text-coral-800">
            {error}
          </p>
        )}

        <p className="text-xs leading-5 text-slate-500">
          L’écriture choisie garde son libellé, sa catégorie, son justificatif
          et son statut ; un brouillon sans compte reçoit le compte du relevé.
          Le brouillon « {entry.label} » créé par l’import sera supprimé.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            type="button"
            icon={choice ? Link2 : Check}
            loading={saving}
            disabled={!choice}
            onClick={link}
          >
            Rattacher et supprimer le brouillon
          </Button>
        </div>
      </div>
    </AccountingModal>
  );
}
