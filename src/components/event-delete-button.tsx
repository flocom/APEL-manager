"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/client";

export function EventDeleteButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (
      !confirm(
        "Supprimer définitivement cet événement, ainsi que ses tâches et inscriptions ?",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await api(`/api/events/${eventId}`, { method: "DELETE" });
      router.push("/dashboard/events");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button variant="danger" size="sm" onClick={remove} disabled={loading}>
      Supprimer
    </Button>
  );
}
