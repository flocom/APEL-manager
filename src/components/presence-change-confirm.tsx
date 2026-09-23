"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/**
 * Le bouton qui applique un changement de réponse à une réunion.
 *
 * Un bouton, et non l'ouverture du lien : les messageries suivent les liens
 * des e-mails pour les inspecter, et le changement doit venir d'un geste du
 * parent, pas d'un robot qui passait par là.
 */
export function PresenceChangeConfirm({
  token,
  confirmation,
}: {
  token: string;
  /** Ce que l'écran dit une fois le changement fait. */
  confirmation: string;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (done) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        {confirmation}
      </p>
    );
  }

  async function confirmer() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/meetings/attendance/confirm", { body: { token } });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Button
        loading={loading}
        onClick={confirmer}
        className="min-h-12 w-full sm:w-auto"
      >
        Confirmer le changement
      </Button>
    </div>
  );
}
