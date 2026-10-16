import {
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  Hand,
  Info,
  ListChecks,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

import { PaymentNote } from "@/components/payment-note";

/**
 * « Comment participer ? » : les trois démarches côte à côte.
 *
 * Né d'un retour de réunion. Trois choses se confondaient : adhérer (la
 * cotisation), avoir un compte sur le site (prendre des tâches) et donner un
 * coup de main sur un rendez-vous (sans compte). Une maman avait écrit depuis
 * « Nous rejoindre » et se croyait inscrite ; un papa avait réglé la cotisation
 * et pensait que ça suffisait pour prendre des tâches. Ici, chaque démarche a
 * sa carte, son bouton, et la phrase du dessous dit noir sur blanc qu'aucune
 * ne remplace l'autre.
 *
 * Composant serveur, et sans rien de la base au-delà de chaînes déjà calculées :
 * la page qui l'appelle reste seule à manipuler les événements.
 *
 * Règle multi-association : la façon de régler la cotisation vient du réglage
 * « Comment régler » (`membershipFeeNote`). Rien n'est écrit en dur — une école
 * la fait payer avec sa facture, une autre par HelloAsso, une troisième en
 * liquide à la rentrée.
 */

type Lien = {
  href: string;
  /** Libellé du bouton ; chaque carte a le sien par défaut. */
  libelle?: string;
  /** Petite ligne sous le bouton (« Le formulaire est plus bas… »). */
  aide?: string;
};

const BOUTON_PLEIN =
  "group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

/**
 * Un bouton dit où il mène, comme sur la page Adhérer : ↓ on descend dans la
 * page, ↗ on en change. Une ancre reste une balise <a> ; le reste passe par
 * <Link>, pour la navigation côté client.
 */
function Bouton({ href, libelle }: { href: string; libelle: string }) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={BOUTON_PLEIN}>
        {libelle}
        <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
        <span className="sr-only"> (plus bas sur cette page)</span>
      </a>
    );
  }
  return (
    <Link href={href} className={BOUTON_PLEIN}>
      {libelle}
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function ParticipationPaths({
  membershipFeeNote,
  cotisation = null,
  adherer,
  coupDeMain,
  prochain = null,
  surface = "clair",
  niveauTitre = 3,
}: {
  /** Le réglage « Comment régler », tel que saisi par le bureau (vide = rien). */
  membershipFeeNote: string;
  /** Le tarif, seulement quand le bureau l'a publié. */
  cotisation?: { montant: string; suffixe: string | null } | null;
  /**
   * Où mène « Adhérer ». `null` quand on ne peut écrire nulle part (aucune
   * adresse de contact publiée) : la carte renvoie alors au bureau de vive voix.
   */
  adherer: Lien | null;
  /** La liste des rendez-vous, là où l'on prend un créneau sans compte. */
  coupDeMain: Lien;
  /** Le prochain rendez-vous daté, s'il y en a un : l'action la plus concrète. */
  prochain?: { titre: string; date: string; href: string } | null;
  /** « sombre » : posé sur un aplat bleu nuit (héros), cartes blanches. */
  surface?: "clair" | "sombre";
  /** h2 sous un h1 de page, h3 sous un h2 de section. */
  niveauTitre?: 2 | 3;
}) {
  const Titre = niveauTitre === 2 ? "h2" : "h3";
  const note = membershipFeeNote.trim();
  const carte = `flex flex-col overflow-hidden rounded-2xl bg-white text-brand-950 ${
    surface === "clair" ? "border-2 border-slate-200" : ""
  }`;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ——— Adhérer : la cotisation, rien d'autre ——— */}
        <article className={carte}>
          <span aria-hidden="true" className="h-2 bg-brand-600" />
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-950"
              >
                <UserPlus className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <Titre className="min-w-0 text-xl font-black leading-tight tracking-[-0.03em] sm:text-2xl lg:text-xl xl:text-2xl">
                Adhérer à l’APEL
              </Titre>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              La cotisation annuelle à l’association.
            </p>

            {/* Les modalités viennent du bureau, mot pour mot. Sans réglage,
                une phrase qui ne suppose rien : chaque école a sa façon. */}
            <div className="mt-4 rounded-xl border-2 border-slate-200 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
                {cotisation ? "Cotisation annuelle" : "Comment régler"}
              </p>
              {cotisation && (
                <p className="mt-1 break-words font-black tracking-[-0.02em] text-brand-950">
                  {cotisation.montant}
                  {cotisation.suffixe ? ` ${cotisation.suffixe}` : ""}
                </p>
              )}
              {note ? (
                <PaymentNote
                  note={note}
                  className="mt-1 text-sm font-medium leading-6 text-slate-700"
                />
              ) : (
                <p className="mt-1 text-sm font-medium leading-6 text-slate-700">
                  Le bureau vous indique
                  {cotisation ? "" : " le montant et"} la façon de la régler.
                </p>
              )}
            </div>

            <p className="mt-4 flex gap-2 text-sm font-semibold leading-6 text-brand-950">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-sea-600"
                aria-hidden="true"
              />
              <span>
                Vous avez déjà réglé la cotisation ? Vous êtes adhérent : rien à
                faire ici.
              </span>
            </p>

            <div className="mt-auto pt-5">
              {adherer ? (
                <>
                  <Bouton href={adherer.href} libelle={adherer.libelle ?? "Adhérer"} />
                  {adherer.aide && (
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {adherer.aide}
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium leading-6 text-slate-600">
                  L’association n’a pas encore publié d’adresse de contact.
                  Parlez-en à un parent de l’équipe à la sortie de l’école.
                </p>
              )}
            </div>
          </div>
        </article>

        {/* ——— Le compte : ce qu'il apporte, dit avec un exemple concret ——— */}
        <article className={carte}>
          <span aria-hidden="true" className="h-2 bg-sand-400" />
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand-100 text-brand-950"
              >
                <ListChecks className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <Titre className="min-w-0 text-xl font-black leading-tight tracking-[-0.03em] sm:text-2xl lg:text-xl xl:text-2xl">
                Créer un compte
              </Titre>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Pour voir les tâches de chaque événement et dire «&nbsp;Je m’en
              charge&nbsp;» — par exemple réserver la chaise du Père Noël.
            </p>
            <ul className="mt-4 space-y-2 text-sm font-medium leading-6 text-slate-700">
              <li className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sand-500"
                />
                Vos tâches réunies dans «&nbsp;Mes tâches&nbsp;», avec des
                rappels.
              </li>
              <li className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sand-500"
                />
                Gratuit ; le bureau valide le compte.
              </li>
            </ul>

            <div className="mt-auto pt-5">
              <Bouton href="/register" libelle="Créer un compte" />
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Déjà un compte ?{" "}
                <Link
                  href="/login"
                  className="font-extrabold text-brand-800 underline underline-offset-2 hover:text-brand-600"
                >
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </article>

        {/* ——— Le coup de main : un créneau, sans compte ni adhésion ——— */}
        <article className={carte}>
          <span aria-hidden="true" className="h-2 bg-sea-500" />
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sea-200 text-brand-950"
              >
                <Hand className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <Titre className="min-w-0 text-xl font-black leading-tight tracking-[-0.03em] sm:text-2xl lg:text-xl xl:text-2xl">
                Donner un coup de main sur un événement
              </Titre>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Choisir un créneau sur un événement, sans compte.
            </p>
            <ul className="mt-4 space-y-2 text-sm font-medium leading-6 text-slate-700">
              <li className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sea-600"
                />
                Sans être adhérent : votre nom et votre e-mail suffisent.
              </li>
              <li className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sea-600"
                />
                Un lien dans l’e-mail de confirmation libère le créneau si la
                semaine tourne autrement.
              </li>
            </ul>

            {/* Le prochain rendez-vous appartient à cette carte-ci : c'est la
                seule des trois à offrir une action immédiate et datée. */}
            {prochain && (
              <Link
                href={prochain.href}
                className="group mt-4 flex items-start gap-3 rounded-xl border-2 border-slate-200 p-3 transition-colors hover:border-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
                    Prochain rendez-vous
                  </span>
                  <span className="mt-1 block break-words font-black tracking-[-0.02em] text-brand-950">
                    {prochain.titre}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-slate-600">
                    {prochain.date}
                  </span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-brand-700"
                  aria-hidden="true"
                />
                <span className="sr-only"> (page du rendez-vous)</span>
              </Link>
            )}

            <div className="mt-auto pt-5">
              <Bouton
                href={coupDeMain.href}
                libelle={coupDeMain.libelle ?? "Voir les événements"}
              />
              {coupDeMain.aide && (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {coupDeMain.aide}
                </p>
              )}
            </div>
          </div>
        </article>
      </div>

      {/* La phrase que la réunion a réclamée. Hors des cartes, pour qu'on la
          lise même en n'en regardant qu'une. */}
      <p
        className={`mt-4 flex gap-3 rounded-2xl px-5 py-4 text-sm font-bold leading-6 sm:text-base ${
          surface === "clair"
            ? "bg-sand-100 text-brand-950"
            : "border-2 border-brand-800 text-white"
        }`}
      >
        <Info
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            surface === "clair" ? "text-brand-700" : "text-sea-300"
          }`}
          aria-hidden="true"
        />
        <span>
          Adhérer ne crée pas de compte, et un compte n’est pas une adhésion.
          Chaque démarche se fait séparément.
        </span>
      </p>
    </div>
  );
}
