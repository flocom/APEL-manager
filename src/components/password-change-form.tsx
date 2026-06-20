"use client";

import { useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

export function PasswordChangeForm() {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/me/password", {
        method: "PATCH",
        body: {
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        },
      });
      toast("Mot de passe mis à jour.");
      formRef.current?.reset();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <Field label="Mot de passe actuel" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="Nouveau mot de passe" htmlFor="newPassword" hint="8 caractères minimum.">
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" loading={loading}>
        Changer le mot de passe
      </Button>
    </form>
  );
}
