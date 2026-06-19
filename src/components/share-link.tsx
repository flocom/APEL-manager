"use client";

import { useState } from "react";

import { Button, Input } from "@/components/ui";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // L'API clipboard peut être indisponible : on ignore silencieusement.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
        {copied ? "Copié ✓" : "Copier le lien"}
      </Button>
    </div>
  );
}
