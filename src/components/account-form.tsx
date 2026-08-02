"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

export function AccountForm({
  name,
  telegramChatId,
  telegramReady,
  telegramBotUsername,
}: {
  name: string;
  telegramChatId: string | null;
  /** Faux tant qu'un administrateur n'a pas activé Telegram avec un token confirmé. */
  telegramReady: boolean;
  telegramBotUsername: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: {
          name: form.get("name"),
          // Champ masqué : ne rien envoyer, sinon un simple changement de nom
          // effacerait le chat ID enregistré avant la fermeture du canal.
          ...(telegramReady
            ? { telegramChatId: form.get("telegramChatId") }
            : {}),
        },
      });
      toast("Modifications enregistrées.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nom complet" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} required minLength={2} />
      </Field>
      {telegramReady ? (
        <Field
          label="Chat ID Telegram (facultatif)"
          htmlFor="telegramChatId"
          hint={`Pour recevoir les rappels par Telegram : ouvrez une conversation avec ${
            telegramBotUsername ? `@${telegramBotUsername}` : "le bot de l’association"
          }, puis indiquez votre Chat ID (obtenu via le bot @userinfobot).`}
        >
          <Input
            id="telegramChatId"
            name="telegramChatId"
            defaultValue={telegramChatId ?? ""}
            placeholder="Ex. 123456789"
          />
        </Field>
      ) : (
        telegramChatId && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
            Les notifications Telegram sont désactivées par l’administration.
            Votre Chat ID reste enregistré et resservira si le canal est
            rouvert.
          </p>
        )
      )}
      <Button type="submit" loading={loading}>
        Enregistrer
      </Button>
    </form>
  );
}
