"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";

import { Input, Select, Textarea } from "@/components/ui";
import type { NiveauExigence, PvPersonne } from "@/lib/documents/ag-types";

/**
 * Les champs de l'éditeur de procès-verbal.
 *
 * Chacun porte son niveau d'exigence réel. C'est le point sur lequel toute la
 * recherche a convergé : la tentation d'écrire « obligatoire » parce que c'est
 * plus persuasif fait mentir l'outil sur son propre fondement, et un bénévole
 * qui découvre l'exagération se remet à son fichier Word. La loi de 1901
 * n'impose presque rien ; les statuts, beaucoup ; les tiers, le reste.
 */

const NIVEAUX: Record<NiveauExigence, { texte: string; classe: string } | null> = {
  legal: {
    texte: "exigé par la loi",
    classe: "bg-brand-50 text-brand-800 ring-brand-200",
  },
  statutaire: {
    texte: "prévu par vos statuts",
    classe: "bg-sea-50 text-sea-800 ring-sea-200",
  },
  tiers: {
    texte: "attendu par les tiers",
    classe: "bg-sand-100 text-sand-900 ring-sand-300",
  },
  usage: {
    texte: "usage, non obligatoire",
    classe: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  facultatif: null,
};

/**
 * Le niveau d'exigence fait partie du nom accessible du champ, et c'est voulu :
 * savoir qu'une mention est exigée par la loi ou seulement attendue par une
 * banque est utile à qui écoute la page autant qu'à qui la regarde. Le tiret
 * invisible évite seulement que cela se lise « Présents attendu par les tiers ».
 */
export function Exigence({ niveau }: { niveau: NiveauExigence }) {
  const n = NIVEAUX[niveau];
  if (!n) return null;
  return (
    <>
      <span className="sr-only"> — </span>
      <span
        className={`ml-2 rounded px-1.5 py-0.5 align-middle text-[11px] font-semibold ring-1 ring-inset ${n.classe}`}
      >
        {n.texte}
      </span>
    </>
  );
}

export function Champ({
  label,
  htmlFor,
  aide,
  niveau = "facultatif",
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  aide?: string;
  niveau?: NiveauExigence;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-bold text-slate-700"
      >
        {label}
        <Exigence niveau={niveau} />
      </label>
      {children}
      {aide && <p className="mt-1.5 text-xs leading-5 text-slate-500">{aide}</p>}
    </div>
  );
}

export function ChampTexte({
  label,
  valeur,
  onChange,
  aide,
  niveau,
  lignes,
  placeholder,
  className,
  type = "text",
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  aide?: string;
  niveau?: NiveauExigence;
  lignes?: number;
  placeholder?: string;
  className?: string;
  type?: "text" | "date" | "time";
}) {
  const id = useId();
  return (
    <Champ label={label} htmlFor={id} aide={aide} niveau={niveau} className={className}>
      {lignes ? (
        <Textarea
          id={id}
          rows={lignes}
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Champ>
  );
}

export function ChampNombre({
  label,
  valeur,
  onChange,
  aide,
  niveau,
  min = 0,
  className,
}: {
  label: string;
  valeur: number | null;
  onChange: (v: number | null) => void;
  aide?: string;
  niveau?: NiveauExigence;
  min?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <Champ label={label} htmlFor={id} aide={aide} niveau={niveau} className={className}>
      <Input
        id={id}
        type="number"
        min={min}
        inputMode="numeric"
        value={valeur === null ? "" : String(valeur)}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </Champ>
  );
}

export function ChampChoix<T extends string>({
  label,
  valeur,
  onChange,
  options,
  aide,
  niveau,
  className,
}: {
  label: string;
  valeur: T;
  onChange: (v: T) => void;
  options: { valeur: T; libelle: string }[];
  aide?: string;
  niveau?: NiveauExigence;
  className?: string;
}) {
  const id = useId();
  return (
    <Champ label={label} htmlFor={id} aide={aide} niveau={niveau} className={className}>
      <Select
        id={id}
        value={valeur}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </Select>
    </Champ>
  );
}

export function ChampBoolean({
  label,
  valeur,
  onChange,
  aide,
}: {
  label: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
  aide?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border-2 border-slate-200 p-3.5 transition-colors hover:border-slate-300">
      <input
        type="checkbox"
        checked={valeur}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-700">{label}</span>
        {aide && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{aide}</span>}
      </span>
    </label>
  );
}

/**
 * Une personne : un adhérent choisi dans la liste, ou un nom libre. Le chef
 * d'établissement et le représentant de la fédération ne sont pas adhérents, et
 * ce sont pourtant eux qu'on invite le plus souvent.
 */
export function ChampPersonne({
  label,
  valeur,
  onChange,
  adherents,
  aide,
  niveau,
  placeholderQualite = "Qualité (président, secrétaire…)",
}: {
  label: string;
  valeur: PvPersonne;
  onChange: (v: PvPersonne) => void;
  adherents: { id: string; name: string }[];
  aide?: string;
  niveau?: NiveauExigence;
  placeholderQualite?: string;
}) {
  const id = useId();
  return (
    <Champ label={label} htmlFor={id} aide={aide} niveau={niveau}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          id={id}
          list={`${id}-adherents`}
          value={valeur.nom}
          placeholder="Nom et prénom"
          onChange={(e) => {
            const nom = e.target.value;
            const trouve = adherents.find((a) => a.name === nom);
            onChange({ ...valeur, nom, memberId: trouve?.id ?? null });
          }}
        />
        <datalist id={`${id}-adherents`}>
          {adherents.map((a) => (
            <option key={a.id} value={a.name} />
          ))}
        </datalist>
        <Input
          value={valeur.qualite}
          placeholder={placeholderQualite}
          onChange={(e) => onChange({ ...valeur, qualite: e.target.value })}
        />
      </div>
    </Champ>
  );
}

/** Liste de personnes qu'on allonge au besoin : scrutateurs, invités… */
export function ListePersonnes({
  label,
  valeurs,
  onChange,
  adherents,
  aide,
  ajouterLabel,
}: {
  label: string;
  valeurs: PvPersonne[];
  onChange: (v: PvPersonne[]) => void;
  adherents: { id: string; name: string }[];
  aide?: string;
  ajouterLabel: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-slate-700">{label}</p>
      {aide && <p className="mb-2 text-xs leading-5 text-slate-500">{aide}</p>}
      <div className="space-y-2">
        {valeurs.map((personne, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <Input
                value={personne.nom}
                placeholder="Nom et prénom"
                aria-label={`${label} — nom ${index + 1}`}
                onChange={(e) => {
                  const suite = [...valeurs];
                  const trouve = adherents.find((a) => a.name === e.target.value);
                  suite[index] = {
                    ...personne,
                    nom: e.target.value,
                    memberId: trouve?.id ?? null,
                  };
                  onChange(suite);
                }}
              />
              <Input
                value={personne.qualite}
                placeholder="Qualité"
                aria-label={`${label} — qualité ${index + 1}`}
                onChange={(e) => {
                  const suite = [...valeurs];
                  suite[index] = { ...personne, qualite: e.target.value };
                  onChange(suite);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(valeurs.filter((_, i) => i !== index))}
              aria-label={`Retirer ${personne.nom || `la ligne ${index + 1}`}`}
              className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-coral-50 hover:text-coral-700 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...valeurs, { memberId: null, nom: "", qualite: "" }])}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Plus className="h-4 w-4" />
        {ajouterLabel}
      </button>
    </div>
  );
}

/** Liste de lignes de texte : ordre du jour, annexes, documents joints. */
export function ListeTexte({
  label,
  valeurs,
  onChange,
  aide,
  ajouterLabel,
  placeholder,
  numerotee = false,
  niveau,
}: {
  label: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
  aide?: string;
  ajouterLabel: string;
  placeholder?: string;
  numerotee?: boolean;
  niveau?: NiveauExigence;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-slate-700">
        {label}
        {niveau && <Exigence niveau={niveau} />}
      </p>
      {aide && <p className="mb-2 text-xs leading-5 text-slate-500">{aide}</p>}
      <div className="space-y-2">
        {valeurs.map((valeur, index) => (
          <div key={index} className="flex items-center gap-2">
            {numerotee && (
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-extrabold text-brand-800"
              >
                {index + 1}
              </span>
            )}
            <Input
              value={valeur}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              onChange={(e) => {
                const suite = [...valeurs];
                suite[index] = e.target.value;
                onChange(suite);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(valeurs.filter((_, i) => i !== index))}
              aria-label={`Retirer la ligne ${index + 1}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-coral-50 hover:text-coral-700 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...valeurs, ""])}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Plus className="h-4 w-4" />
        {ajouterLabel}
      </button>
    </div>
  );
}
