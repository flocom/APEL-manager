"use client";

import { CopyPlus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";

export interface ReusableTemplate {
  id: string;
  name: string;
  taskCount: number;
  version: number;
}

/**
 * Les deux façons de réutiliser le travail fait sur un événement : en faire un
 * modèle réutilisable, ou rejouer l'événement à une autre date.
 */
export function EventReuseActions({
  eventId,
  eventTitle,
  taskCount,
  slotCount,
  templates,
  defaultStartAt,
}: {
  eventId: string;
  eventTitle: string;
  taskCount: number;
  slotCount: number;
  templates: ReusableTemplate[];
  /** Date du début, préremplie à un an plus tard dans le formulaire de copie. */
  defaultStartAt: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<"template" | "copy" | null>(null);
  const [busy, setBusy] = useState(false);
  // Le modèle choisi dans la liste, distinct de la demande de confirmation :
  // sélectionner ne doit pas déclencher le dialogue.
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReusableTemplate | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState(eventTitle);

  async function saveAsTemplate(target: ReusableTemplate | null) {
    setBusy(true);
    try {
      const result = await api<{ taskCount: number; previousCount: number }>(
        `/api/events/${eventId}/save-template`,
        {
          body: target
            ? { templateId: target.id, version: target.version }
            : { name: newTemplateName || null },
        },
      );
      toast(
        target
          ? `Modèle « ${target.name} » remplacé : ${result.previousCount} → ${result.taskCount} tâches.`
          : `Modèle créé avec ${result.taskCount} tâches.`,
      );
      setPanel(null);
      setSelectedTemplate(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function copyEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ event: { id: string } }>(
        `/api/events/${eventId}/duplicate`,
        {
          body: {
            startAt: form.get("startAt"),
            title: form.get("title") || null,
          },
        },
      );
      toast("Copie créée en brouillon.");
      router.push(`/dashboard/events/${result.event.id}`);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={Save}
          onClick={() => setPanel(panel === "template" ? null : "template")}
          disabled={taskCount === 0}
        >
          Copier dans les modèles
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={CopyPlus}
          onClick={() => setPanel(panel === "copy" ? null : "copy")}
        >
          Copier à une autre date
        </Button>
      </div>

      {taskCount === 0 && (
        <p className="text-sm text-slate-500">
          La check-list est vide : ajoutez des tâches avant de pouvoir en faire
          un modèle.
        </p>
      )}

      {panel === "template" && taskCount > 0 && (
        <Card className="!rounded-xl border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-brand-950">
                Copier cet événement dans les modèles
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Ses {taskCount} tâches, dans leur ordre actuel, deviennent un
                modèle réutilisable. Les événements déjà créés ne bougent pas ;
                seules les prochaines applications du modèle en profiteront.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-950"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <fieldset className="space-y-3">
            <legend className="sr-only">Destination du modèle</legend>
            <label className="flex items-start gap-2.5 text-sm font-semibold text-brand-950">
              <input
                type="radio"
                name="template-target"
                className="mt-1"
                checked={selectedTemplate === null}
                onChange={() => setSelectedTemplate(null)}
              />
              Créer un nouveau modèle
            </label>
            {selectedTemplate === null && (
              <div className="pl-6">
                <Field label="Nom du modèle" htmlFor="new-template-name">
                  <Input
                    id="new-template-name"
                    value={newTemplateName}
                    onChange={(event) =>
                      setNewTemplateName(event.currentTarget.value)
                    }
                    maxLength={120}
                    placeholder={eventTitle}
                  />
                </Field>
              </div>
            )}

            {templates.length > 0 && (
              <>
                <label className="flex items-start gap-2.5 text-sm font-semibold text-brand-950">
                  <input
                    type="radio"
                    name="template-target"
                    className="mt-1"
                    checked={selectedTemplate !== null}
                    onChange={() => setSelectedTemplate(templates[0])}
                  />
                  Remplacer un modèle existant
                </label>
                {selectedTemplate !== null && (
                  <div className="pl-6">
                    <Field label="Modèle à remplacer" htmlFor="target-template">
                      <Select
                        id="target-template"
                        value={selectedTemplate.id}
                        onChange={(event) =>
                          setSelectedTemplate(
                            templates.find(
                              (template) =>
                                template.id === event.currentTarget.value,
                            ) ?? templates[0],
                          )
                        }
                      >
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.taskCount} tâches)
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="mt-4">
            <Button
              type="button"
              variant={selectedTemplate ? "danger" : "primary"}
              onClick={() =>
                selectedTemplate ? setConfirming(true) : saveAsTemplate(null)
              }
              disabled={busy}
              loading={busy}
            >
              {selectedTemplate ? "Remplacer le modèle" : "Créer le modèle"}
            </Button>
          </div>
        </Card>
      )}

      {panel === "copy" && (
        <Card className="!rounded-xl border-slate-200 bg-slate-50 p-4">
          <form onSubmit={copyEvent}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-brand-950">
                  Copier à une autre date
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  La copie reprend la check-list ({taskCount} tâches) et les
                  créneaux bénévoles ({slotCount}), avec les échéances et les
                  horaires replacés par rapport à la nouvelle date. Les
                  inscriptions, les écritures comptables et les pièces jointes
                  ne sont pas copiées. La copie est créée en brouillon.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-950"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nouvelle date de début" htmlFor="copy-start">
                <Input
                  id="copy-start"
                  name="startAt"
                  type="datetime-local"
                  defaultValue={defaultStartAt}
                  required
                />
              </Field>
              <Field
                label="Titre de la copie"
                htmlFor="copy-title"
                hint="Laissez vide pour reprendre le titre actuel."
              >
                <Input
                  id="copy-title"
                  name="title"
                  defaultValue={eventTitle}
                  maxLength={200}
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                Créer la copie
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPanel(null)}
                disabled={busy}
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ConfirmDialog
        open={confirming && selectedTemplate !== null}
        title={`Remplacer « ${selectedTemplate?.name ?? ""} » ?`}
        description={
          selectedTemplate
            ? `Ses ${selectedTemplate.taskCount} tâches actuelles seront remplacées par les ${taskCount} tâches de cet événement. Cette action ne peut pas être annulée.`
            : ""
        }
        confirmLabel="Remplacer le modèle"
        loading={busy}
        onConfirm={() => selectedTemplate && saveAsTemplate(selectedTemplate)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
