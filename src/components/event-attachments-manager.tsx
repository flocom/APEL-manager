"use client";

import { ExternalLink, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileUploadField } from "@/components/file-upload-field";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { formatLongDate } from "@/lib/dates";

export interface EventAttachmentView {
  id: string;
  label: string;
  fileUrl: string;
  uploaderName: string | null;
  createdAt: string;
}

export function EventAttachmentsManager({
  eventId,
  attachments,
  canManage,
}: {
  eventId: string;
  attachments: EventAttachmentView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<EventAttachmentView | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/events/${eventId}/attachments`, {
        body: {
          label: form.get("label"),
          fileUrl: form.get("fileUrl"),
        },
      });
      toast("Pièce jointe ajoutée.");
      setAdding(false);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(attachment: EventAttachmentView) {
    try {
      await api(`/api/events/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      toast("Pièce jointe retirée.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && !adding && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setAdding(true)}
        >
          Ajouter une pièce jointe
        </Button>
      )}

      {adding && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-bold text-brand-950">Nouvelle pièce jointe</p>
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={saving}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-950"
              aria-label="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field label="Nom du document" htmlFor="attachment-label">
            <Input
              id="attachment-label"
              name="label"
              placeholder="Devis du traiteur, affiche, attestation d’assurance…"
              required
              maxLength={200}
            />
          </Field>
          <FileUploadField
            name="fileUrl"
            scope="document"
            label="Fichier"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Ajouter
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdding(false)}
              disabled={saving}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}

      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="Aucune pièce jointe"
          description="Rassemblez ici les devis, affiches, attestations et plans de salle de l’événement."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border-2 border-slate-200">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-brand-950">
                    {attachment.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ajouté le {formatLongDate(attachment.createdAt)}
                    {attachment.uploaderName
                      ? ` par ${attachment.uploaderName}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-50"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Ouvrir
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(attachment)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-coral-50 hover:text-coral-700"
                    aria-label={`Retirer ${attachment.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Retirer cette pièce jointe ?"
        description={
          pendingDelete
            ? `« ${pendingDelete.label} » ne sera plus rattachée à l’événement. Le fichier reste conservé dans le stockage.`
            : ""
        }
        confirmLabel="Retirer"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
