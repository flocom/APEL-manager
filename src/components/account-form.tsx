"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import { api } from "@/lib/client";

export function AccountForm({
  name,
  telegramChatId,
}: {
  name: string;
  telegramChatId: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: {
          name: form.get("name"),
          telegramChatId: form.get("telegramChatId"),
        },
      });
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status === "error" && message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      <div>
        <Label htmlFor="name">Nom complet</Label>
        <Input id="name" name="name" defaultValue={name} required minLength={2} />
      </div>
      <div>
        <Label htmlFor="telegramChatId">Chat ID Telegram (facultatif)</Label>
        <Input
          id="telegramChatId"
          name="telegramChatId"
          defaultValue={telegramChatId ?? ""}
          placeholder="Ex. 123456789"
        />
        <p className="mt-1 text-xs text-slate-400">
          Pour recevoir les rappels par Telegram : ouvrez une conversation avec
          le bot de l'association, puis indiquez votre Chat ID (obtenu via le bot
          @userinfobot).
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {status === "saved" && (
          <span className="text-sm text-green-600">Enregistré ✓</span>
        )}
      </div>
    </form>
  );
}
