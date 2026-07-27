"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [loading, onCancel, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center px-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-brand-950/70"
        aria-label="Fermer la confirmation"
        onClick={onCancel}
        disabled={loading}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative w-full max-w-md rounded-2xl border-2 border-slate-200 bg-white p-6"
      >
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-coral-700 text-white">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2
          id="confirm-dialog-title"
          className="mt-4 pr-8 text-xl font-bold text-slate-950"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-description"
          className="mt-2 text-sm leading-6 text-slate-600"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
