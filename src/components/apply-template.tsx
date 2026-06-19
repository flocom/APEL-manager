"use client";

import { ListPlus } from "lucide-react";
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
  templates: { key: string; label: string; count: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function apply() {
    if (!key) return;
    setLoading(true);
    try {
      const res = await api<{ created: number }>(
        `/api/events/${eventId}/apply-template`,
        { body: { templateKey: key } },
      );
      toast(`${res.created} tâche(s) ajoutée(s) depuis le modèle.`);
      setKey("");
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
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="sm:max-w-xs"
      >
        <option value="">Partir d'un modèle…</option>
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label} ({t.count} tâches)
          </option>
        ))}
      </Select>
      <Button
        onClick={apply}
        disabled={!key}
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
