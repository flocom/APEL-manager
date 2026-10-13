"use client";

import { File, FileText } from "lucide-react";

import type { ReceiptView } from "@/lib/accounting/receipts";
import { cn } from "@/lib/utils";

/**
 * Aperçu d'un reçu de la boîte à justificatifs : la photo elle-même quand le
 * navigateur sait l'afficher, une icône pour un PDF ou un autre document.
 * Partagé par la boîte et par la fenêtre d'association.
 */

/** Formats d'image que tout navigateur affiche (une photo HEIC, non). */
const DISPLAYABLE_IMAGES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isDisplayableImage(receipt: Pick<ReceiptView, "contentType">) {
  return DISPLAYABLE_IMAGES.has(receipt.contentType.toLowerCase());
}

export function isPdfReceipt(receipt: Pick<ReceiptView, "contentType" | "filename">) {
  return (
    receipt.contentType.toLowerCase() === "application/pdf" ||
    /\.pdf$/i.test(receipt.filename)
  );
}

/** Taille d'un fichier : « 245 Ko », « 1,2 Mo ». */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Vignette carrée par défaut ; `className` en fixe la taille (`h-16 w-16`,
 * ou une grande zone dans la fenêtre d'association). L'image est décorative :
 * le nom du fichier est toujours écrit à côté.
 */
export function ReceiptThumbnail({
  receipt,
  className,
  fit = "cover",
}: {
  receipt: Pick<ReceiptView, "fileUrl" | "contentType" | "filename">;
  className?: string;
  /** `contain` : la pièce entière, pour la lire plutôt que la reconnaître. */
  fit?: "cover" | "contain";
}) {
  if (isDisplayableImage(receipt)) {
    return (
      <span
        className={cn(
          "block shrink-0 overflow-hidden rounded-lg border-2 border-slate-200 bg-slate-50",
          className,
        )}
      >
        {/* Aperçu volontairement en <img> : un fichier téléversé, réservé aux
            administrateurs, que l'optimiseur d'images n'a pas à servir. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={receipt.fileUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "h-full w-full",
            fit === "contain" ? "object-contain" : "object-cover",
          )}
        />
      </span>
    );
  }
  const pdf = isPdfReceipt(receipt);
  const Icon = pdf ? FileText : File;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border-2",
        pdf
          ? "border-coral-200 bg-coral-50 text-coral-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
        className,
      )}
    >
      <span className="flex flex-col items-center gap-0.5">
        <Icon className="h-6 w-6" aria-hidden="true" />
        <span className="text-[0.625rem] font-bold uppercase tracking-[0.12em]">
          {pdf ? "PDF" : (/\.([a-z0-9]{1,4})$/i.exec(receipt.filename)?.[1] ?? "Doc")}
        </span>
      </span>
    </span>
  );
}
