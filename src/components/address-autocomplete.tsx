"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui";
import type {
  AddressSearchResponse,
  AddressSuggestion,
} from "@/lib/address-types";
import { cn } from "@/lib/utils";

/**
 * Recherche d'adresse au-dessus des champs d'une adresse postale : on tape
 * « 12 rue des lilas les sables », on choisit une proposition, et le numéro,
 * la voie, le code postal, la ville et le pays se remplissent (`onPick`). Les
 * champs restent modifiables : la recherche aide, elle n'impose rien.
 *
 * Liste déroulante accessible (combobox ARIA) : flèches, Entrée, Échap.
 * Données OpenStreetMap, via `/api/adresses` — l'attribution est affichée
 * sous la liste, comme la licence le demande.
 */
export function AddressAutocomplete({
  id,
  onPick,
  className,
}: {
  id: string;
  onPick: (suggestion: AddressSuggestion) => void;
  className?: string;
}) {
  const listId = useId();
  const [saisie, setSaisie] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [recherche, setRecherche] = useState(false);
  const [indisponible, setIndisponible] = useState(false);
  // Ne pas relancer de recherche sur le libellé qu'on vient de choisir.
  const choisi = useRef<string | null>(null);

  useEffect(() => {
    const q = saisie.trim();
    if (q.length < 3 || q === choisi.current) {
      setSuggestions([]);
      setRecherche(false);
      return;
    }
    const controleur = new AbortController();
    const minuterie = window.setTimeout(async () => {
      setRecherche(true);
      try {
        const reponse = await fetch(`/api/adresses?q=${encodeURIComponent(q)}`, {
          signal: controleur.signal,
          headers: { Accept: "application/json" },
        });
        if (!reponse.ok) {
          setIndisponible(true);
          setSuggestions([]);
          return;
        }
        const corps = (await reponse.json()) as AddressSearchResponse;
        setIndisponible(false);
        setSuggestions(corps.suggestions ?? []);
        setActif(-1);
        setOuvert(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setIndisponible(true);
      } finally {
        if (!controleur.signal.aborted) setRecherche(false);
      }
    }, 300);
    return () => {
      controleur.abort();
      window.clearTimeout(minuterie);
    };
  }, [saisie]);

  function choisir(suggestion: AddressSuggestion) {
    choisi.current = suggestion.label;
    setSaisie(suggestion.label);
    setOuvert(false);
    setSuggestions([]);
    onPick(suggestion);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!ouvert || suggestions.length === 0) {
      // Entrée dans la recherche ne doit jamais envoyer le formulaire.
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActif((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActif((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choisir(suggestions[actif >= 0 ? actif : 0]);
    } else if (event.key === "Escape") {
      // Échap ferme la liste, pas la fenêtre ni la page autour.
      event.preventDefault();
      setOuvert(false);
    }
  }

  const q = saisie.trim();
  const montrerListe = ouvert && q.length >= 3 && q !== choisi.current;

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={montrerListe}
          aria-controls={listId}
          aria-activedescendant={
            montrerListe && actif >= 0 ? `${listId}-${actif}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          onChange={(e) => {
            choisi.current = null;
            setSaisie(e.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setOuvert(true)}
          onBlur={() => setOuvert(false)}
          onKeyDown={onKeyDown}
          placeholder="Ex. 12 rue des Lilas, Les Sables-d’Olonne"
          className="pl-10 pr-10"
        />
        {recherche && (
          <Loader2
            className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden="true"
          />
        )}
      </div>

      {montrerListe && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-lg">
          {suggestions.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Adresses proposées">
              {suggestions.map((s, index) => (
                <li
                  key={s.label}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === actif}
                  // mousedown et non click : le champ perdrait le focus avant,
                  // et la liste se fermerait sous le doigt.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choisir(s);
                  }}
                  onMouseEnter={() => setActif(index)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-sm",
                    index === actif ? "bg-brand-50 text-brand-950" : "text-slate-700",
                  )}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 break-words">{s.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="listbox" aria-label="Adresses proposées" className="px-3.5 py-3 text-sm text-slate-600">
              {recherche
                ? "Recherche…"
                : "Aucune adresse trouvée : saisissez-la dans les champs ci-dessous."}
            </p>
          )}
          <p className="border-t border-slate-100 bg-slate-50 px-3.5 py-1.5 text-[11px] text-slate-500">
            Données © les contributeurs OpenStreetMap
          </p>
        </div>
      )}
      {indisponible && (
        <p className="mt-1.5 text-xs text-slate-500" role="status">
          La recherche d’adresse ne répond pas : saisissez l’adresse dans les
          champs ci-dessous.
        </p>
      )}
    </div>
  );
}
