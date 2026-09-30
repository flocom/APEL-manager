"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Fenêtre par-dessus la liste des écritures (formulaire d'écriture,
 * rapprochement) : le bouton d'une ligne en bas d'une longue liste ouvre la
 * fenêtre là où l'on regarde, et la liste reste en place derrière. Échap ou un
 * clic sur le fond referment, sauf pendant l'enregistrement ; le premier champ
 * reçoit le curseur, et le focus revient au bouton d'origine à la fermeture.
 */
export function AccountingModal({
  title,
  eyebrow = "Livre de comptes",
  busy,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (
      panel?.querySelector<HTMLElement>("[data-autofocus], form select, form input, form textarea") ??
      panel
    )?.focus();

    function onKeyDown(event: KeyboardEvent) {
      // Un champ qui traite lui-même Échap (création de catégorie) l'a déjà
      // consommé : la fenêtre reste ouverte.
      if (event.key === "Escape" && !event.defaultPrevented && !busyRef.current) {
        closeRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[45] grid grid-cols-[minmax(0,1fr)] place-items-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-brand-950/70"
        aria-label="Fermer le formulaire"
        onClick={onClose}
        disabled={busy}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounting-modal-title"
        className="relative flex outline-none max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border-2 border-slate-200 bg-white sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
              {eyebrow}
            </p>
            <h2 id="accounting-modal-title" className="mt-1 text-xl font-bold text-brand-950">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Fermer le formulaire"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </section>
    </div>
  );
}
