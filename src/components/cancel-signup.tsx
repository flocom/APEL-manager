"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/client";

export function CancelSignup({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        Votre désinscription est enregistrée. Merci de nous avoir prévenus !
      </p>
    );
  }

  async function cancel() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/signup/cancel", { body: { token } });
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <Button variant="danger" loading={loading} onClick={cancel}>
        Confirmer ma désinscription
      </Button>
    </div>
  );
}
