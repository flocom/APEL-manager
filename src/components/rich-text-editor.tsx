"use client";

import { Bold } from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";

import { FormattedText } from "@/components/formatted-text";
import { Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export function RichTextEditor({
  id,
  name,
  value,
  onValueChange,
  placeholder,
  maxLength = 5000,
  className,
}: {
  id: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 112)}px`;
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  function toggleBold() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const wrappedBefore = value.slice(Math.max(0, start - 2), start) === "**";
    const wrappedAfter = value.slice(end, end + 2) === "**";
    let nextValue: string;
    let nextStart: number;
    let nextEnd: number;

    if (selected && wrappedBefore && wrappedAfter) {
      nextValue =
        value.slice(0, start - 2) + selected + value.slice(end + 2);
      nextStart = start - 2;
      nextEnd = end - 2;
    } else if (selected.startsWith("**") && selected.endsWith("**")) {
      const unwrapped = selected.slice(2, -2);
      nextValue = value.slice(0, start) + unwrapped + value.slice(end);
      nextStart = start;
      nextEnd = start + unwrapped.length;
    } else {
      const replacement = selected ? `**${selected}**` : "****";
      nextValue = value.slice(0, start) + replacement + value.slice(end);
      nextStart = start + 2;
      nextEnd = selected ? end + 2 : start + 2;
    }

    if (nextValue.length > maxLength) return;
    onValueChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleBold();
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-2 border-b-0 border-slate-200 bg-slate-50 px-2 py-1.5">
        <button
          type="button"
          onClick={toggleBold}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-white hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Mettre la sélection en gras"
          title="Gras (Ctrl ou Cmd + B)"
        >
          <Bold className="h-3.5 w-3.5" />
          Gras
        </button>
        <span className="text-xs text-slate-500">
          Entrée pour aller à la ligne
        </span>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onValueChange(event.target.value)}
        onInput={resize}
        onKeyDown={onKeyDown}
        className={cn(
          "min-h-28 resize-none overflow-hidden rounded-t-none",
          className,
        )}
        aria-describedby={`${id}-format-help`}
      />
      <p id={`${id}-format-help`} className="mt-1.5 text-xs text-slate-500">
        Sélectionnez un passage puis cliquez sur « Gras ». Limite :{" "}
        {value.length.toLocaleString("fr-FR")}/{maxLength.toLocaleString("fr-FR")}.
      </p>
      {value.trim() && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Aperçu
          </p>
          <FormattedText
            text={value}
            className="text-sm leading-6 text-slate-700"
          />
        </div>
      )}
    </div>
  );
}
