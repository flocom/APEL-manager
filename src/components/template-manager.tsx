"use client";

import { Download, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/client";

interface TplTask {
  title: string;
  leadTimeDays: number;
  description?: string;
}
export interface Tpl {
  id: string;
  name: string;
  description: string | null;
  tasks: TplTask[];
}

// Ligne de tâche éditée : uid stable (clés React) + leadTimeDays gardé en
// chaîne pour autoriser le champ vide pendant la saisie (coercition au save).
type EditorTask = { uid: number; title: string; leadTimeDays: string; description?: string };
let uidCounter = 0;
const nextUid = () => (uidCounter += 1);

export function TemplateManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<null | "new" | Tpl>(null);
  const [seeding, setSeeding] = useState(false);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {templates.length === 0 && (
          <Button variant="outline" icon={Download} loading={seeding} onClick={seed}>
            Importer les modèles par défaut
          </Button>
        )}
        <Button icon={Plus} onClick={() => setEditing("new")}>
          Nouveau modèle
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Aucun modèle de check-list"
          description="Importez les modèles prêts à l'emploi (vide-grenier, kermesse…) ou créez les vôtres."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{t.name}</p>
                <Badge color="blue">{t.tasks.length} tâches</Badge>
              </div>
              {t.description && (
                <p className="mt-1 text-sm text-slate-500">{t.description}</p>
              )}
              <div className="mt-3 flex gap-2 pt-1">
                <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(t)}>
                  Modifier
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(t)}>
                  Supprimer
                </Button>
              </div>
            </Card>
          ))}
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
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [tasks, setTasks] = useState<EditorTask[]>(() =>
    (template?.tasks.length
      ? template.tasks
      : [{ title: "", leadTimeDays: 7 }]
    ).map((t) => ({
      uid: nextUid(),
      title: t.title,
      leadTimeDays: String(t.leadTimeDays),
      description: t.description,
    })),
  );
  const [loading, setLoading] = useState(false);

  function updateTask(uid: number, patch: Partial<EditorTask>) {
    setTasks((ts) => ts.map((t) => (t.uid === uid ? { ...t, ...patch } : t)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = tasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        leadTimeDays: Number(t.leadTimeDays) || 0,
        description: t.description,
      }));
    if (cleaned.length === 0) {
      toast("Ajoutez au moins une tâche.", "error");
      return;
    }
    setLoading(true);
    try {
      const body = { name, description, tasks: cleaned };
      if (template) {
        await api(`/api/templates/${template.id}`, { method: "PATCH", body });
        toast("Modèle mis à jour.");
      } else {
        await api("/api/templates", { body });
        toast("Modèle créé.");
      }
      router.refresh();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {template ? "Modifier le modèle" : "Nouveau modèle"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={save} className="space-y-4">
        <Field label="Nom du modèle" htmlFor="tpl-name">
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="Ex. Tournoi sportif"
          />
        </Field>
        <Field label="Description (facultatif)" htmlFor="tpl-desc">
          <Textarea
            id="tpl-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div>
          <Label>Tâches</Label>
          <p className="mb-2 text-xs text-slate-400">
            Chaque tâche a un délai « à gérer X jours avant l'événement ».
          </p>
          <div className="space-y-2">
            {tasks.map((task, i) => (
              <div key={task.uid} className="flex items-center gap-2">
                <Input
                  value={task.title}
                  onChange={(e) => updateTask(task.uid, { title: e.target.value })}
                  placeholder={`Tâche ${i + 1}`}
                  className="flex-1"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={task.leadTimeDays}
                    onChange={(e) =>
                      updateTask(task.uid, { leadTimeDays: e.target.value })
                    }
                    className="w-20"
                  />
                  <span className="text-xs text-slate-400">j avant</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTasks((ts) => ts.filter((t) => t.uid !== task.uid))
                  }
                  className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  aria-label="Retirer la tâche"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Plus}
            className="mt-2"
            onClick={() =>
              setTasks((ts) => [
                ...ts,
                { uid: nextUid(), title: "", leadTimeDays: "7" },
              ])
            }
          >
            Ajouter une tâche
          </Button>
        </div>

        <div className="flex gap-2 border-t border-slate-100 pt-4">
          <Button type="submit" loading={loading}>
            {template ? "Enregistrer" : "Créer le modèle"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
