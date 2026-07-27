"use client";

import { ListPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Select } from "@/components/ui";
import { api } from "@/lib/client";

export function ApplyTemplate({
  eventId,
  templates,
}: {
  eventId: string;
  templates: { id: string; name: string; count: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Aucun modèle disponible.{" "}
        <Link
          href="/dashboard/events/templates"
          className="text-brand-600 hover:underline"
        >
          Créer un modèle
        </Link>
      </p>
    );
  }

  async function apply() {
    if (!templateId) return;
    setLoading(true);
    try {
      const res = await api<{ created: number }>(
        `/api/events/${eventId}/apply-template`,
        { body: { templateId } },
      );
      toast(`${res.created} tâche(s) ajoutée(s) depuis le modèle.`);
      setTemplateId("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="sm:max-w-xs"
      >
        <option value="">Partir d'un modèle…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.count} tâches)
          </option>
        ))}
      </Select>
      <Button
        onClick={apply}
        disabled={!templateId}
        loading={loading}
        icon={ListPlus}
        variant="outline"
        size="sm"
        className="shrink-0"
      >
        Ajouter ces tâches
      </Button>
    </div>
  );
}
