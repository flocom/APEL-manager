"use client";

import {
  CheckCircle2,
  Download,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/client";
import {
  formatLeadTimeDuration,
  LEAD_TIME_MAX,
  leadTimeToDays,
  resolveLeadTime,
  type LeadTimeUnit,
} from "@/lib/task-lead-time";
import { useMutationError } from "@/lib/use-mutation-error";
import { cn } from "@/lib/utils";

interface TplTask {
  title: string;
  leadTimeDays: number;
  leadTimeValue?: number;
  leadTimeUnit?: LeadTimeUnit;
  description?: string;
}
export interface Tpl {
  id: string;
  name: string;
  description: string | null;
  tasks: TplTask[];
  version: number;
}

type EditorTask = {
  uid: number;
  title: string;
  leadTimeValue: string;
  leadTimeUnit: LeadTimeUnit;
  description?: string;
};
let uidCounter = 0;
const nextUid = () => (uidCounter += 1);

function formatTemplateTaskLeadTime(task: TplTask) {
  const duration = resolveLeadTime(task);
  return formatLeadTimeDuration(
    duration.leadTimeValue,
    duration.leadTimeUnit,
  );
}

const templateTones = [
  {
    border: "!border-brand-200",
    accent: "bg-brand-600",
    icon: "text-brand-700",
  },
  {
    border: "!border-sea-200",
    accent: "bg-sea-600",
    icon: "text-sea-700",
  },
  {
    border: "!border-slate-200",
    accent: "bg-slate-500",
    icon: "text-slate-600",
  },
] as const;

export function TemplateManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<null | "new" | Tpl>(null);
  const [seeding, setSeeding] = useState(false);
  const [query, setQuery] = useState("");
  const filteredTemplates = templates.filter((template) => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return true;
    return (
      template.name.toLocaleLowerCase("fr").includes(needle) ||
      template.description?.toLocaleLowerCase("fr").includes(needle) ||
      template.tasks.some((task) =>
        task.title.toLocaleLowerCase("fr").includes(needle),
      )
    );
  });

  async function seed() {
    setSeeding(true);
    try {
      const res = await api<{ created: number }>("/api/templates/seed");
      toast(`${res.created} modèle(s) importé(s).`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSeeding(false);
    }
  }

  async function remove(t: Tpl) {
    if (!confirm(`Supprimer le modèle « ${t.name} » ?`)) return;
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" });
      toast("Modèle supprimé.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div aria-hidden className="flex gap-1.5">
              <span className="h-8 w-2 rounded bg-brand-600" />
              <span className="h-8 w-2 rounded bg-sea-600" />
              <span className="h-8 w-2 rounded bg-slate-500" />
            </div>
            <div>
              <p className="font-bold text-slate-950">
                {templates.length} modèle{templates.length > 1 ? "s" : ""} prêt
                {templates.length > 1 ? "s" : ""}
              </p>
              <p className="text-sm text-slate-500">
                Choisissez un modèle pour consulter ou modifier ses tâches.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.length === 0 && (
              <Button
                variant="outline"
                icon={Download}
                loading={seeding}
                onClick={seed}
                className="!bg-white !bg-none !shadow-none hover:!translate-y-0"
              >
                Importer les modèles par défaut
              </Button>
            )}
            <Button
              icon={Plus}
              onClick={() => setEditing("new")}
              className="!bg-brand-600 !bg-none !shadow-none hover:!translate-y-0 hover:!bg-brand-700"
            >
              Nouveau modèle
            </Button>
          </div>
        </div>
        {templates.length > 4 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un modèle ou une tâche…"
              className="pl-10"
              aria-label="Rechercher dans les modèles"
            />
          </div>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white">
            <ListChecks className="h-7 w-7" />
          </span>
          <p className="mt-4 font-bold text-slate-950">
            Aucun modèle de check-list
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Importez les modèles prêts à l&apos;emploi (vide-grenier,
            kermesse…) ou créez les vôtres.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredTemplates.map((t, index) => {
            const tone = templateTones[index % templateTones.length];
            return (
              <Card
                key={t.id}
                className={cn(
                  "group relative flex flex-col overflow-hidden !rounded-2xl !shadow-none transition-colors hover:!bg-slate-50",
                  tone.border,
                )}
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-1.5", tone.accent)}
                />
                <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
                  <div className="min-w-0">
                    <p className="font-bold tracking-tight text-slate-950">
                      {t.name}
                    </p>
                    {t.description && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-500">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Badge color="blue" className="!rounded-lg shrink-0">
                    {t.tasks.length} tâches
                  </Badge>
                </div>
                <div className="mx-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  {t.tasks.slice(0, 3).map((task, taskIndex) => (
                    <div
                      key={`${task.title}-${taskIndex}`}
                      className="flex items-start gap-2 text-sm text-slate-600"
                    >
                      <CheckCircle2
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          tone.icon,
                        )}
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {task.title}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-brand-700">
                        {formatTemplateTaskLeadTime(task)}
                      </span>
                    </div>
                  ))}
                  {t.tasks.length > 3 && (
                    <p className="pl-6 text-xs font-semibold text-slate-400">
                      + {t.tasks.length - 3} autre
                      {t.tasks.length - 3 > 1 ? "s" : ""} tâche
                      {t.tasks.length - 3 > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <div className="mt-5 flex gap-2 border-t border-slate-200 bg-white px-5 py-4">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={Pencil}
                    onClick={() => setEditing(t)}
                    className="!bg-white !bg-none !shadow-none hover:!translate-y-0"
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => remove(t)}
                    className="!shadow-none hover:!translate-y-0 hover:!bg-coral-50 hover:!text-coral-800"
                  >
                    Supprimer
                  </Button>
                </div>
              </Card>
            );
          })}
          {filteredTemplates.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
              Aucun modèle ne correspond à cette recherche.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: Tpl | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const onError = useMutationError();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [tasks, setTasks] = useState<EditorTask[]>(() =>
    (template?.tasks.length
      ? template.tasks
      : [{ title: "", leadTimeDays: 7 }]
    ).map((t) => {
      const duration = resolveLeadTime(t);
      return {
        uid: nextUid(),
        title: t.title,
        leadTimeValue: String(duration.leadTimeValue),
        leadTimeUnit: duration.leadTimeUnit,
        description: t.description,
      };
    }),
  );
  const [loading, setLoading] = useState(false);

  function updateTask(uid: number, patch: Partial<EditorTask>) {
    setTasks((ts) => ts.map((t) => (t.uid === uid ? { ...t, ...patch } : t)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = tasks
      .filter((t) => t.title.trim())
      .map((t) => {
        const leadTimeValue = Number(t.leadTimeValue) || 0;
        return {
          title: t.title.trim(),
          leadTimeDays: leadTimeToDays(leadTimeValue, t.leadTimeUnit),
          leadTimeValue,
          leadTimeUnit: t.leadTimeUnit,
          description: t.description,
        };
      });
    if (cleaned.length === 0) {
      toast("Ajoutez au moins une tâche.", "error");
      return;
    }
    setLoading(true);
    try {
      if (template) {
        await api(`/api/templates/${template.id}`, {
          method: "PATCH",
          body: { name, description, tasks: cleaned, version: template.version },
        });
        toast("Modèle mis à jour.");
      } else {
        await api("/api/templates", { body: { name, description, tasks: cleaned } });
        toast("Modèle créé.");
      }
      router.refresh();
      onClose();
    } catch (e) {
      onError(e);
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden !rounded-2xl !border-brand-200 !shadow-none">
      <div className="flex items-center justify-between border-b border-brand-200 bg-brand-50 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-slate-950">
              {template ? "Modifier le modèle" : "Nouveau modèle"}
            </h2>
            <p className="text-sm text-slate-600">
              Définissez les tâches à réutiliser.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-xl border border-brand-200 bg-white text-slate-500 transition-colors hover:bg-brand-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={save} className="space-y-5 p-5 sm:p-6">
        <Field label="Nom du modèle" htmlFor="tpl-name">
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="Ex. Tournoi sportif"
            className="!rounded-xl !bg-white !shadow-none focus:!ring-2"
          />
        </Field>
        <Field label="Description (facultatif)" htmlFor="tpl-desc">
          <Textarea
            id="tpl-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="!rounded-xl !bg-white !shadow-none focus:!ring-2"
          />
        </Field>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Label>Tâches</Label>
          <p className="mb-3 text-xs text-slate-500">
            Définissez pour chacune à partir de quand elle doit être traitée.
          </p>
          <div className="space-y-2">
            {tasks.map((task, i) => (
              <div
                key={task.uid}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(260px,auto)_auto] sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-xs font-extrabold text-brand-700">
                      {i + 1}
                    </span>
                    <Input
                      value={task.title}
                      onChange={(e) =>
                        updateTask(task.uid, { title: e.target.value })
                      }
                      placeholder={`Tâche ${i + 1}`}
                      className="flex-1 !rounded-xl !bg-white !shadow-none focus:!ring-2"
                    />
                  </div>
                  <div className="grid shrink-0 grid-cols-[90px_minmax(150px,1fr)] gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={LEAD_TIME_MAX[task.leadTimeUnit]}
                      value={task.leadTimeValue}
                      onChange={(e) =>
                        updateTask(task.uid, {
                          leadTimeValue: e.target.value,
                        })
                      }
                      aria-label={`Durée de traitement de la tâche ${i + 1}`}
                      className="w-24 !rounded-xl !bg-white !shadow-none focus:!ring-2"
                    />
                    <Select
                      value={task.leadTimeUnit}
                      onChange={(e) => {
                        const unit = e.target.value as LeadTimeUnit;
                        updateTask(task.uid, {
                          leadTimeUnit: unit,
                          leadTimeValue: String(
                            Math.min(
                              Number(task.leadTimeValue) || 0,
                              LEAD_TIME_MAX[unit],
                            ),
                          ),
                        });
                      }}
                      aria-label={`Unité de traitement de la tâche ${i + 1}`}
                      className="!rounded-xl !bg-white !shadow-none focus:!ring-2"
                    >
                      <option value="days">jour(s) avant</option>
                      <option value="weeks">semaine(s) avant</option>
                      <option value="months">mois avant</option>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTasks((ts) => ts.filter((t) => t.uid !== task.uid))
                    }
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-50 text-coral-700 transition-colors hover:bg-coral-100 hover:text-coral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                    aria-label="Retirer la tâche"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-brand-700">
                    Consigne détaillée (facultatif)
                  </summary>
                  <Textarea
                    value={task.description ?? ""}
                    onChange={(event) =>
                      updateTask(task.uid, {
                        description: event.target.value,
                      })
                    }
                    rows={2}
                    maxLength={2000}
                    placeholder="Précisions utiles pour réaliser cette tâche…"
                    className="mt-2 !rounded-xl !bg-white !shadow-none focus:!ring-2"
                  />
                </details>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Plus}
            className="mt-3 !bg-white !bg-none !shadow-none hover:!translate-y-0"
            onClick={() =>
              setTasks((ts) => [
                ...ts,
                {
                  uid: nextUid(),
                  title: "",
                  leadTimeValue: "1",
                  leadTimeUnit: "weeks",
                },
              ])
            }
          >
            Ajouter une tâche
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
          <Button
            type="submit"
            loading={loading}
            className="!bg-brand-600 !bg-none !shadow-none hover:!translate-y-0 hover:!bg-brand-700"
          >
            {template ? "Enregistrer" : "Créer le modèle"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="!bg-white !bg-none !shadow-none hover:!translate-y-0"
          >
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
