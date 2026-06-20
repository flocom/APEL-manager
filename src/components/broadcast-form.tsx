"use client";

import { Mail, Send } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

export function BroadcastForm({
  endpoint,
  title,
  hint,
}: {
  endpoint: string;
  title: string;
  hint: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ sent: number }>(endpoint, {
        body: { subject: form.get("subject"), message: form.get("message") },
      });
      toast(
        res.sent > 0
          ? `Message envoyé à ${res.sent} destinataire(s).`
          : "Aucun e-mail n'a pu être envoyé (vérifiez la configuration e-mail).",
        res.sent > 0 ? "success" : "error",
      );
      if (res.sent > 0) setOpen(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" icon={Mail} onClick={() => setOpen(true)}>
        {title}
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <p className="text-sm text-slate-500">{hint}</p>
      <Field label="Objet" htmlFor="bc-subject">
        <Input id="bc-subject" name="subject" required maxLength={160} />
      </Field>
      <Field label="Message" htmlFor="bc-message">
        <Textarea id="bc-message" name="message" rows={5} required />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" icon={Send} loading={loading}>
          Envoyer
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
