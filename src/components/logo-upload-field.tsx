"use client";

import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp";

/**
 * Logo de l'association. Le fichier est déposé dans le scope `branding`, le
 * seul dont la lecture est publique : il s'affiche sur l'accueil, la page
 * d'inscription des bénévoles et les écrans de connexion.
 */
export function LogoUploadField({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string | null;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [value, setValue] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const body = new FormData();
    body.set("scope", "branding");
    body.set("file", file);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        file?: { url?: string };
      };
      if (!response.ok || !payload.file?.url) {
        throw new Error(payload.error || "Envoi du logo impossible.");
      }
      setValue(payload.file.url);
      toast("Logo importé. Enregistrez pour l’appliquer.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Field
      label="Logo"
      htmlFor={id}
      className="sm:col-span-2"
      hint="PNG, JPEG ou WebP. Affiché sur le site public, l’espace de travail et l’onglet du navigateur. Sans logo, celui livré avec l’application est utilisé."
    >
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-3">
        <span className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-slate-200 bg-white p-1.5">
          {/* Aperçu volontairement en <img> : la source change à chaque envoi
              et n'a pas besoin de l'optimiseur d'images. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value || "/logo.svg"}
            alt={value ? "Logo de l’association" : "Logo par défaut"}
            className="h-full w-full object-contain"
          />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-800",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ImageUp className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? "Envoi en cours…" : "Choisir une image"}
            <input
              ref={fileInput}
              id={id}
              type="file"
              className="sr-only"
              accept={ACCEPTED_TYPES}
              disabled={uploading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => setValue("")}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-coral-300 hover:text-coral-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Retirer
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}
