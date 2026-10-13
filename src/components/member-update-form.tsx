"use client";

import { CheckCircle2, CircleAlert, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button, buttonClasses, Field, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import {
  CIVILITIES,
  isFrance,
  MEMBER_INFO_FIELD_LABELS,
  memberCompleteness,
  REQUIRED_MEMBER_INFO_FIELDS,
  type Civility,
  type MemberInfoField,
} from "@/lib/member-info/completeness";
import type {
  PublicMemberForm,
  PublicMemberUpdateInput,
} from "@/lib/member-info/types";
import { cn } from "@/lib/utils";

/**
 * Le formulaire public de `/adhesion/[token]` : la famille complète sa fiche
 * d'adhérent depuis le lien reçu par e-mail.
 *
 * Ce qui manque est calculé à chaque frappe avec les règles de la fiche
 * (`memberCompleteness`) : l'encadré se vide à mesure qu'on remplit, et les
 * champs encore vides restent surlignés. Les aides reprennent les consignes
 * de l'Apel départementale — « le code postal seul », « la ville seule » —,
 * pour que l'adresse arrive découpée comme son tableau l'attend.
 */

const CIVILITE_OPTIONS: Record<Civility, string> = {
  M: "Monsieur",
  Mme: "Madame",
  Mrme: "Monsieur et Madame",
};

type Valeurs = {
  civility: Civility | null;
  email: string;
  phone: string;
  streetNumber: string;
  addressLine1: string;
  addressLine2: string;
  locality: string;
  postalCode: string;
  city: string;
  country: string;
  nationalFeeElsewhere: boolean;
  otherSchoolName: string;
};

type ChampTexte = Exclude<keyof Valeurs, "civility" | "nationalFeeElsewhere">;

function valeursDe(form: PublicMemberForm): Valeurs {
  return {
    civility: form.civility,
    email: form.email ?? "",
    phone: form.phone ?? "",
    streetNumber: form.streetNumber ?? "",
    addressLine1: form.addressLine1 ?? "",
    addressLine2: form.addressLine2 ?? "",
    locality: form.locality ?? "",
    postalCode: form.postalCode ?? "",
    city: form.city ?? "",
    country: form.country || "France",
    nationalFeeElsewhere: form.nationalFeeElsewhere,
    otherSchoolName: form.otherSchoolName ?? "",
  };
}

const vide = (value: string) => (value.trim() === "" ? null : value.trim());

/** Quels champs de saisie portent chaque information manquante. */
const CHAMPS_DE: Record<MemberInfoField, ReadonlyArray<keyof Valeurs>> = {
  civility: ["civility"],
  street: ["addressLine1", "locality"],
  postalCode: ["postalCode"],
  city: ["city"],
  country: ["country"],
  otherSchoolName: ["otherSchoolName"],
  phone: ["phone"],
  email: ["email"],
  streetNumber: ["streetNumber"],
};

export function MemberUpdateForm({
  token,
  initial,
}: {
  token: string;
  initial: PublicMemberForm;
}) {
  const [valeurs, setValeurs] = useState<Valeurs>(() => valeursDe(initial));
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState<MemberInfoField[] | null>(null);
  // La fenêtre de confirmation : sans elle, le bouton redevenait cliquable et
  // la page restait la même — rien ne disait à la famille que c'était fait.
  const [confirmation, setConfirmation] = useState(false);

  const etat = useMemo(() => memberCompleteness(valeurs), [valeurs]);
  const aSurligner = useMemo(() => {
    const champs = new Set<keyof Valeurs>();
    for (const manque of etat.required) {
      for (const champ of CHAMPS_DE[manque]) champs.add(champ);
    }
    return champs;
  }, [etat.required]);

  function changer<K extends keyof Valeurs>(champ: K, valeur: Valeurs[K]) {
    setValeurs((avant) => ({ ...avant, [champ]: valeur }));
    setEnregistre(null);
    if (erreurs[champ]) {
      setErreurs(({ [champ]: _retire, ...reste }) => reste);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur(null);
    setErreurs({});
    if (!valeurs.civility) {
      setErreurs({ civility: "Choisissez une civilité." });
      return;
    }
    const corps: PublicMemberUpdateInput = {
      civility: valeurs.civility,
      email: vide(valeurs.email),
      phone: vide(valeurs.phone),
      streetNumber: vide(valeurs.streetNumber),
      addressLine1: vide(valeurs.addressLine1),
      addressLine2: vide(valeurs.addressLine2),
      locality: vide(valeurs.locality),
      postalCode: valeurs.postalCode.trim(),
      city: valeurs.city.trim(),
      country: valeurs.country.trim(),
      nationalFeeElsewhere: valeurs.nationalFeeElsewhere,
      otherSchoolName: valeurs.nationalFeeElsewhere
        ? vide(valeurs.otherSchoolName)
        : null,
    };
    setEnvoi(true);
    try {
      const reponse = await api<{ ok: true; missing: MemberInfoField[] }>(
        `/api/adhesion/${encodeURIComponent(token)}`,
        { body: corps },
      );
      setEnregistre(reponse.missing);
      setConfirmation(true);
    } catch (e) {
      const issues =
        e instanceof ApiError &&
        e.body &&
        typeof e.body === "object" &&
        "issues" in e.body
          ? (e.body as { issues?: Record<string, string[] | undefined> }).issues
          : undefined;
      if (issues && Object.keys(issues).length > 0) {
        const parChamp: Record<string, string> = {};
        for (const [champ, messages] of Object.entries(issues)) {
          if (messages?.[0]) parChamp[champ] = messages[0];
        }
        setErreurs(parChamp);
        setErreur("Certains champs sont à revoir.");
      } else {
        setErreur((e as Error).message);
      }
    } finally {
      setEnvoi(false);
    }
  }

  const texte = (
    champ: ChampTexte,
    props: {
      label: string;
      hint?: string;
      autoComplete?: string;
      inputMode?: "text" | "numeric" | "tel" | "email";
      type?: string;
      maxLength: number;
      required?: boolean;
      className?: string;
    },
  ) => {
    const id = `adhesion-${champ}`;
    return (
      <Field
        label={props.label}
        htmlFor={id}
        hint={props.hint}
        error={erreurs[champ]}
        className={props.className}
      >
        <Input
          id={id}
          name={champ}
          type={props.type ?? "text"}
          value={valeurs[champ]}
          onChange={(e) => changer(champ, e.target.value)}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          maxLength={props.maxLength}
          required={props.required}
          aria-invalid={erreurs[champ] ? true : undefined}
          className={cn(
            aSurligner.has(champ) && "border-amber-400 bg-amber-50",
            erreurs[champ] && "border-red-400",
          )}
        />
      </Field>
    );
  };

  const manquentObligatoires = etat.required;
  const manquentFacultatifs = etat.recommended;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {enregistre ? (
        <div
          role="status"
          className="rounded-2xl border-2 border-sea-300 bg-sea-50 p-4"
        >
          <p className="flex items-center gap-2 text-base font-black text-brand-950">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-sea-700" />
            Merci, votre fiche est enregistrée.
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-700">
            {enregistre.every((f) => !REQUIRED_MEMBER_INFO_FIELDS.includes(f))
              ? "Elle est complète : vous n’avez rien d’autre à faire."
              : `Il manque encore : ${enregistre
                  .filter((f) => REQUIRED_MEMBER_INFO_FIELDS.includes(f))
                  .map((f) => MEMBER_INFO_FIELD_LABELS[f].toLocaleLowerCase("fr"))
                  .join(", ")}. Vous pouvez compléter ci-dessous et enregistrer à nouveau.`}
          </p>
        </div>
      ) : manquentObligatoires.length > 0 || manquentFacultatifs.length > 0 ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          {manquentObligatoires.length > 0 && (
            <>
              <p className="text-sm font-extrabold text-brand-950">
                Il manque à votre fiche :
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm font-medium text-slate-800">
                {manquentObligatoires.map((f) => (
                  <li key={f}>{MEMBER_INFO_FIELD_LABELS[f]}</li>
                ))}
              </ul>
            </>
          )}
          {manquentFacultatifs.length > 0 && (
            <p
              className={cn(
                "text-sm font-medium text-slate-600",
                manquentObligatoires.length > 0 && "mt-2",
              )}
            >
              Facultatif, mais utile au bureau :{" "}
              {manquentFacultatifs
                .map((f) => MEMBER_INFO_FIELD_LABELS[f].toLocaleLowerCase("fr"))
                .join(", ")}
              .
            </p>
          )}
        </div>
      ) : null}

      {erreur && (
        <p
          role="alert"
          className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-800"
        >
          {erreur}
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-extrabold text-brand-950">
          Civilité
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CIVILITIES.map((code) => (
            <label
              key={code}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-3 py-2 transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200",
                aSurligner.has("civility")
                  ? "border-amber-400"
                  : "border-slate-200",
              )}
            >
              <input
                type="radio"
                name="civility"
                value={code}
                checked={valeurs.civility === code}
                onChange={() => changer("civility", code)}
                className="h-5 w-5 shrink-0 accent-[#0873ab]"
              />
              <span className="text-sm font-bold text-slate-800">
                {CIVILITE_OPTIONS[code]}
              </span>
            </label>
          ))}
        </div>
        {erreurs.civility ? (
          <p className="mt-1.5 text-xs font-medium text-red-600">
            {erreurs.civility}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            « Madame » vaut aussi pour Mademoiselle ; « Monsieur et Madame »
            pour un couple.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-extrabold text-brand-950">
          Adresse postale
        </legend>
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
          {texte("streetNumber", {
            label: "N°",
            hint: "Avec bis, ter…",
            autoComplete: "off",
            maxLength: 20,
          })}
          {texte("addressLine1", {
            label: "Voie",
            hint: "Rue, avenue, route…",
            autoComplete: "address-line1",
            maxLength: 200,
          })}
        </div>
        {texte("addressLine2", {
          label: "Complément",
          hint: "Résidence, bâtiment, lotissement — facultatif.",
          autoComplete: "address-line2",
          maxLength: 200,
        })}
        {texte("locality", {
          label: "Lieu-dit ou commune déléguée",
          hint: "Sans nom de voie, le lieu-dit suffit. Pour une commune nouvelle, le nom de l’ancienne commune.",
          autoComplete: "address-line3",
          maxLength: 120,
        })}
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
          {texte("postalCode", {
            label: "Code postal",
            hint: "Le code postal seul.",
            autoComplete: "postal-code",
            inputMode: isFrance(valeurs.country) ? "numeric" : "text",
            maxLength: 20,
            required: true,
          })}
          {texte("city", {
            label: "Ville",
            hint: "La ville seule.",
            autoComplete: "address-level2",
            maxLength: 120,
            required: true,
          })}
        </div>
        {texte("country", {
          label: "Pays",
          autoComplete: "country-name",
          maxLength: 120,
          required: true,
        })}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-extrabold text-brand-950">
          Pour vous joindre
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {texte("phone", {
            label: "Téléphone",
            type: "tel",
            inputMode: "tel",
            autoComplete: "tel",
            maxLength: 40,
          })}
          {texte("email", {
            label: "Adresse e-mail",
            type: "email",
            inputMode: "email",
            autoComplete: "email",
            maxLength: 254,
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-extrabold text-brand-950">
          Part nationale de la cotisation
        </legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200">
          <input
            type="checkbox"
            checked={valeurs.nationalFeeElsewhere}
            onChange={(e) => changer("nationalFeeElsewhere", e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#0873ab]"
          />
          <span className="text-sm font-medium leading-6 text-slate-800">
            La part nationale (17,50 €) est réglée via un autre établissement
            <span className="block text-xs text-slate-500">
              Par exemple pour un aîné scolarisé ailleurs.
            </span>
          </span>
        </label>
        {valeurs.nationalFeeElsewhere &&
          texte("otherSchoolName", {
            label: "Établissement",
            hint: "Le nom et la commune de l’établissement.",
            autoComplete: "off",
            maxLength: 200,
            required: true,
          })}
      </fieldset>

      <Button
        id="adhesion-enregistrer"
        type="submit"
        icon={Save}
        loading={envoi}
        className="min-h-12 w-full sm:w-auto"
      >
        Enregistrer ma fiche
      </Button>

      {confirmation && enregistre && (
        <ConfirmationEnregistrement
          manquants={enregistre}
          onClose={() => {
            setConfirmation(false);
            // Le bouton, désactivé pendant l'envoi, a perdu le focus : on le
            // lui rend, pour le clavier et les lecteurs d'écran.
            requestAnimationFrame(() =>
              document.getElementById("adhesion-enregistrer")?.focus(),
            );
          }}
        />
      )}
    </form>
  );
}

/**
 * Fenêtre affichée par-dessus le formulaire après l'enregistrement. Fiche
 * complète : la famille sait qu'elle peut fermer la page. Sinon, elle lit ce
 * qui manque encore et revient au formulaire, dont le bandeau le rappelle.
 * Échap, le fond ou le bouton referment.
 */
function ConfirmationEnregistrement({
  manquants,
  onClose,
}: {
  manquants: MemberInfoField[];
  onClose: () => void;
}) {
  const boutonRef = useRef<HTMLButtonElement>(null);
  const fermerRef = useRef(onClose);
  fermerRef.current = onClose;
  // Seul l'obligatoire compte : il ne manque que le téléphone, la fiche est
  // bonne pour l'Apel départementale, et la famille ne doit pas s'inquiéter.
  const requis = manquants.filter((f) => REQUIRED_MEMBER_INFO_FIELDS.includes(f));
  const facultatifs = manquants.filter((f) => !requis.includes(f));
  const complete = requis.length === 0;
  const liste = (champs: MemberInfoField[]) =>
    champs.map((f) => MEMBER_INFO_FIELD_LABELS[f].toLocaleLowerCase("fr")).join(", ");

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    boutonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") fermerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 cursor-default bg-brand-950/60"
        onClick={onClose}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-fiche-titre"
        aria-describedby="confirmation-fiche-texte"
        className="relative w-full max-w-md rounded-2xl border-2 border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8"
      >
        <span
          className={cn(
            "mx-auto grid h-14 w-14 place-items-center rounded-full",
            complete ? "bg-sea-100 text-sea-700" : "bg-amber-100 text-amber-700",
          )}
          aria-hidden="true"
        >
          {complete ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : (
            <CircleAlert className="h-8 w-8" />
          )}
        </span>
        <h2
          id="confirmation-fiche-titre"
          className="mt-4 text-xl font-black text-brand-950"
        >
          {complete ? "Merci, c’est enregistré !" : "Fiche enregistrée"}
        </h2>
        <p
          id="confirmation-fiche-texte"
          className="mt-2 text-sm font-medium leading-6 text-slate-700"
        >
          {complete
            ? "Votre fiche d’adhérent est complète. Vous n’avez rien d’autre à faire : vous pouvez fermer cette page."
            : `Vos informations sont enregistrées, mais il manque encore : ${liste(requis)}.`}
        </p>
        {complete && facultatifs.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Facultatif, si vous le souhaitez : {liste(facultatifs)}.
          </p>
        )}
        <button
          ref={boutonRef}
          type="button"
          onClick={onClose}
          className={cn(buttonClasses("primary"), "mt-6 min-h-12 w-full")}
        >
          {complete ? "Fermer" : "Compléter ma fiche"}
        </button>
      </section>
    </div>
  );
}
