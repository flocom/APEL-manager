"use client";

import { FileUp, LoaderCircle, Paperclip } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".odt",
  ".ods",
].join(",");

export function FileUploadField({
  name,
  scope,
  label,
  defaultValue,
  className,
}: {
  name: string;
  scope: "accounting" | "document";
  label: string;
  defaultValue?: string | null;
  className?: string;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [value, setValue] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  async function upload(file: File) {
    setUploading(true);
    const body = new FormData();
    body.set("scope", scope);
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
        throw new Error(payload.error || "Envoi du fichier impossible.");
      }
      setValue(payload.file.url);
      toast("Fichier enregistré dans le stockage Docker.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      className={className}
      hint="PDF, image ou document bureautique, 15 Mo par défaut. Le fichier est conservé dans le volume Docker."
    >
      <input type="hidden" name={name} value={value} />
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-800",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? "Envoi en cours…" : "Importer un fichier"}
            <input
              ref={fileInput}
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
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Ouvrir le fichier actuel
            </a>
          )}
        </div>
        <div className="mt-3">
          <Input
            id={id}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            disabled={uploading}
            placeholder="Ou collez une URL HTTPS externe"
            autoComplete="off"
          />
        </div>
      </div>
    </Field>
  );
}
