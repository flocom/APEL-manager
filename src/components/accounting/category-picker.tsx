"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";

import type {
  AccountingCategoryPayload,
  AccountingCategoryView,
  AccountingEntryType,
} from "./types";

const NEW_CATEGORY = "__new__";

/**
 * Mini-formulaire « Nouvelle catégorie » posé sous une liste déroulante.
 *
 * Volontairement sans balise <form> : il vit à l'intérieur du formulaire
 * d'écriture, et des formulaires imbriqués sont invalides en HTML. Entrée
 * crée la catégorie au lieu d'envoyer l'écriture.
 */
export function CategoryQuickCreate({
  type,
  idPrefix,
  onCreated,
  onCancel,
}: {
  type: AccountingEntryType;
  idPrefix: string;
  onCreated: (category: AccountingCategoryPayload) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `${idPrefix}-new-category`;
  const errorId = `${inputId}-error`;

  // Les champs de ui.tsx ne transmettent pas de ref typée : on vise l'id.
  const focusInput = () => document.getElementById(inputId)?.focus();

  useEffect(() => {
    document.getElementById(inputId)?.focus();
  }, [inputId]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Donnez un nom à la catégorie.");
      focusInput();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { category } = await api<{
        ok: true;
        category: AccountingCategoryPayload;
      }>("/api/accounting/categories", { body: { name: trimmed, type } });
      onCreated(category);
    } catch (caught) {
      setError((caught as Error).message);
      focusInput();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border-2 border-brand-200 bg-brand-50/60 p-3">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-bold text-brand-900"
      >
        Nouvelle catégorie de {type === "income" ? "recettes" : "dépenses"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          value={name}
          maxLength={160}
          autoComplete="off"
          placeholder={type === "income" ? "Ex. Dons" : "Ex. Frais bancaires"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={saving}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          className="min-w-0 flex-1"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            size="sm"
            icon={Check}
            loading={saving}
            onClick={() => void create()}
            className="min-h-11"
          >
            Créer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={X}
            disabled={saving}
            onClick={onCancel}
            className="min-h-11"
          >
            Annuler
          </Button>
        </div>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-medium text-coral-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Liste des catégories d'un sens (recettes ou dépenses), avec l'option
 * « Nouvelle catégorie… » qui ouvre la création sur place. Ne propose que les
 * catégories actives — plus celle déjà choisie si elle a été désactivée
 * depuis, pour ne pas la faire disparaître d'une écriture qu'on modifie.
 */
export function CategorySelect({
  id,
  type,
  value,
  onChange,
  categories,
  keepId,
  onCreated,
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  id: string;
  type: AccountingEntryType;
  value: string;
  onChange: (value: string) => void;
  categories: AccountingCategoryView[];
  keepId?: string | null;
  onCreated: (category: AccountingCategoryPayload) => void;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [creating, setCreating] = useState(false);
  const options = categories.filter(
    (category) =>
      category.type === type &&
      (category.isActive || category.id === keepId || category.id === value),
  );

  function close() {
    setCreating(false);
    // Rend la main à la liste : le clavier reprend là où il était.
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  return (
    <div className={className}>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (next === NEW_CATEGORY) {
            setCreating(true);
            return;
          }
          onChange(next);
        }}
      >
        <option value="">Sans catégorie</option>
        {options.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {!category.isActive ? " · désactivée" : ""}
          </option>
        ))}
        <option value={NEW_CATEGORY}>＋ Nouvelle catégorie…</option>
      </Select>
      {creating && (
        <CategoryQuickCreate
          type={type}
          idPrefix={id}
          onCancel={close}
          onCreated={(category) => {
            onCreated(category);
            onChange(category.id);
            close();
          }}
        />
      )}
    </div>
  );
}
