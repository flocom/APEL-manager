import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Coins,
  Hand,
  HeartHandshake,
  Mail,
  MapPin,
  MessagesSquare,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JoinForm } from "@/components/join-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsappInviteCard } from "@/components/whatsapp-invite-card";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime, formatLongDateTime } from "@/lib/dates";
import { deEtablissement } from "@/lib/etablissement";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { MEMBERSHIP_FEE_BASIS_SUFFIX } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Page publique « Rejoindre l'association ».
 *
 * Elle sépare deux gestes que la page confondait : adhérer, c'est devenir
 * membre pour l'année scolaire ; donner un coup de main, c'est venir sur un
 * rendez-vous. On peut faire l'un sans l'autre, et le parent venu adhérer ne
 * trouvait auparavant le mot nulle part — ni dans le titre, ni dans les
 * boutons, et le formulaire arrivait après six sections de bénévolat.
 *
 * D'où l'ordre d'aujourd'hui : les deux portes nommées dans le premier écran,
 * ce que chacune veut dire juste en dessous, puis le formulaire. Tout ce qui
 * prouve que l'association existe — l'agenda réel, les places restantes — passe
 * après, parce que c'est une preuve, pas un préalable.
 *
 * Règle de confidentialité : getUpcomingPublishedEvents() rapporte aussi les
 * inscriptions des bénévoles (nom, e-mail, jeton d'annulation). Tout reste dans
 * ce composant serveur ; ne transmettre à un composant client que des primitives
 * déjà calculées, jamais un événement ou un créneau entier.
 *
 * Règle multi-association : l'application sert plusieurs APEL. Aucun montant de
 * cotisation, aucune fédération nommée, aucune règle statutaire (qui vote, ce
 * qui se compte par famille) n'est écrit en dur ici — ces choses varient d'une
 * association à l'autre, et la page renvoie au bureau pour les dire.
 */

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAssociationSettings();
  const title = `Rejoindre ${settings.associationName}`;
  const description = `Adhérer à l’association ou donner un coup de main sur un rendez-vous : deux gestes séparés, chez les parents d’élèves ${deEtablissement(settings.schoolName)}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

/**
 * Ce qu'adhérer veut dire. Deux des cinq lignes dépendent des réglages, parce
 * qu'elles dépendent des statuts : ce que couvre la cotisation, et son montant.
 * Tant que le bureau ne les a pas renseignés, la page ne suppose rien et
 * renvoie à lui — c'est moins pratique, mais ce n'est pas faux.
 */
function ceQuAdhererVeutDire(reglages: {
  membershipFeePublished: boolean;
  membershipFeeBasis: "famille" | "enfant" | "non_precise";
}): string[] {
  const couverture = {
    famille: "Une seule cotisation par famille, quel que soit le nombre d’enfants scolarisés.",
    enfant: "La cotisation se compte par enfant scolarisé.",
    non_precise: null,
  }[reglages.membershipFeeBasis];

  return [
    "Régler la cotisation annuelle et devenir membre de l’association pour l’année scolaire.",
    "Adhérer ne vous engage à aucune présence : ni réunion, ni permanence, ni stand.",
    couverture,
    "Les membres sont convoqués à l’assemblée générale, où l’on présente les comptes et ce qui est prévu.",
    reglages.membershipFeePublished
      ? null
      : "Le montant et la façon de régler sont fixés par l’association pour l’année en cours : écrivez-nous, on vous le dit.",
  ].filter((ligne): ligne is string => ligne !== null);
}

const CE_QUE_LE_COUP_DE_MAIN_VEUT_DIRE = [
  "Venir sur un rendez-vous et prendre une tâche, sans devenir membre.",
  "Deux heures suffisent : un créneau, une tâche, et c’est tout.",
  "On choisit son créneau sur la page du rendez-vous, sans créer de compte.",
  "Un lien dans l’e-mail de confirmation libère le créneau si la semaine tourne autrement.",
];

/**
 * Le déroulé d'un rendez-vous, et non des événements nommés : l'application
 * sert plusieurs associations, et rien ne garantit qu'une école donnée tienne
 * un vide-grenier ou une buvette. Ces quatre moments-là valent pour une
 * kermesse comme pour un marché de Noël ou une soirée jeux.
 */
const MOMENTS = [
  {
    titre: "Les préparatifs",
    texte:
      "Quelques semaines avant, on se répartit ce qu’il y a à faire. Chacun prend ce qui lui va.",
  },
  {
    titre: "Le jour du montage",
    texte:
      "Les tables à installer, la déco à accrocher, le café qui tourne. Une heure plus tard, on ne reconnaît plus l’endroit.",
  },
  {
    titre: "Pendant le rendez-vous",
    texte:
      "On se relaie par petits groupes, on accueille les familles, et l’après-midi passe vite.",
  },
  {
    titre: "Le rangement, à plusieurs",
    texte:
      "On plie, on empile, on partage ce qui reste. C’est là qu’on discute le plus.",
  },
];

const MISSIONS = [
  {
    icon: CalendarDays,
    numero: "01",
    titre: "Les temps forts de l’année",
    texte:
      "Les rendez-vous qui font l’année des enfants, et dont ils parlent encore en juin.",
  },
  {
    icon: Coins,
    numero: "02",
    titre: "Les projets des classes",
    texte:
      "Ce que rapportent les ventes et les événements repart vers les classes : sorties, spectacles, matériel.",
  },
  {
    icon: MessagesSquare,
    numero: "03",
    titre: "La voix des parents",
    texte:
      "L’association porte auprès de la direction ce qui compte pour les familles.",
  },
  {
    icon: Users,
    numero: "04",
    titre: "Le lien entre les familles",
    texte:
      "On prépare ensemble, on discute en rangeant, et l’école devient un endroit où l’on connaît des visages.",
  },
];

/** Teintes des tuiles de mission, pour éviter quatre boîtes blanches identiques. */
const TEINTES_MISSIONS = [
  {
    fond: "bg-brand-950 text-white",
    pastille: "bg-white text-brand-950",
    numero: "text-brand-300",
    texte: "text-brand-100",
  },
  {
    fond: "bg-brand-100 text-brand-950",
    pastille: "bg-brand-950 text-white",
    numero: "text-brand-800",
    texte: "text-brand-900",
  },
  {
    fond: "bg-sea-200 text-brand-950",
    pastille: "bg-brand-950 text-white",
    numero: "text-brand-700",
    texte: "text-brand-950",
  },
  {
    fond: "bg-brand-950 text-white",
    pastille: "bg-white text-brand-950",
    numero: "text-brand-300",
    texte: "text-brand-100",
  },
];

/**
 * Un bouton dit où il mène : ↓ on descend dans la page, ↑ on remonte, ↗ on
 * change de page. La plainte d'origine tenait pour moitié à ça — on cliquait
 * « Écrire à l'association » sans savoir si la page allait changer.
 */
const BOUTON_PLEIN =
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

export default async function RejoindrePage() {
  const [settings, events] = await Promise.all([
    getAssociationSettings(),
    getUpcomingPublishedEvents(),
  ]);

  // Agrégats calculés ici, côté serveur : rien de ce qui vient de la base ne
  // descend jusqu'au navigateur en dehors de ces nombres et de ces chaînes.
  const placesOuvertes = events.reduce(
    (total, event) =>
      total +
      event.volunteerSlots.reduce(
        (somme, slot) => somme + Math.max(0, slot.capacity - slot.signups.length),
        0,
      ),
    0,
  );
  const prochains = events.slice(0, 3).map((event, index) => ({
    id: event.id,
    titre: event.title,
    reunion: event.kind === "meeting",
    date: formatDateTime(event.startAt),
    lieu: event.location,
    jeton: event.shareToken,
    restantes: event.volunteerSlots.reduce(
      (somme, slot) => somme + Math.max(0, slot.capacity - slot.signups.length),
      0,
    ),
    filet:
      event.kind === "meeting"
        ? "bg-coral-600"
        : index % 2 === 0
          ? "bg-brand-700"
          : "bg-sea-500",
  }));
  const prochain = events[0]
    ? {
        titre: events[0].title,
        date: formatLongDateTime(events[0].startAt),
        jeton: events[0].shareToken,
      }
    : null;
  const contactEmail = settings.contactEmail?.trim() || null;
  const rna = settings.rna?.trim() || null;

  // Le tarif affiché, quand le bureau a choisi de le publier. `null` n'est pas
  // zéro : sans réglage, la page continue de renvoyer au bureau.
  const cotisation = settings.membershipFeePublished
    ? {
        montant: (settings.membershipFeeCents! / 100).toLocaleString("fr-FR", {
          style: "currency",
          currency: "EUR",
        }),
        suffixe: MEMBERSHIP_FEE_BASIS_SUFFIX[settings.membershipFeeBasis],
        note: settings.membershipFeeNote.trim(),
      }
    : null;
  const puces = ceQuAdhererVeutDire(settings);

  // Sans adresse de contact publiée, le formulaire n'existe pas et /api/join
  // répond 503 : aucun bouton ne doit alors promettre qu'on peut écrire.
  const ecritureOuverte = contactEmail !== null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        {/* ————— Héros : les deux gestes nommés, et deux portes de même taille ————— */}
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-brand-800"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-brand-700"
          />

          <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20 lg:py-24">
            <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-950">
              <HeartHandshake className="h-4 w-4" strokeWidth={2.5} />
              <span className="break-words">
                {settings.associationName} · {settings.schoolName}
              </span>
            </span>

            <h1 className="mt-7 text-4xl font-black leading-[1.05] tracking-[-0.05em] sm:text-5xl">
              <span className="text-sea-300">Adhérer</span> à l’association, ou{" "}
              <span className="text-sea-300">donner un coup de main</span>.
            </h1>

            {/* Plafonné à deux lignes de téléphone : chaque ligne de trop
                repousse la seconde porte sous la ligne de flottaison, et c'est
                précisément l'égalité des deux voies qui se perd. */}
            <p className="mt-6 text-base font-medium leading-7 text-brand-100 sm:text-lg">
              Deux gestes séparés, chez les parents d’élèves{" "}
              {deEtablissement(settings.schoolName)} : on peut faire l’un,
              l’autre, ou les deux.
            </p>

            {/* Deux cartes rigoureusement jumelles : ni bouton fantôme, ni badge
                « recommandé ». Aucune des deux voies n'est la bonne réponse. */}
            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col rounded-2xl bg-white p-5 text-brand-950 sm:p-6">
                {/* Pastille et titre sur la même ligne : les quarante pixels
                    économisés ramènent la seconde porte au-dessus de la ligne de
                    flottaison d'un téléphone courant. */}
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-950"
                  >
                    <UserPlus className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <h2 className="min-w-0 text-2xl font-black tracking-[-0.03em]">
                    Adhérer
                  </h2>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Devenir membre de l’association pour l’année scolaire. Aucune
                  présence demandée.
                </p>
                {ecritureOuverte ? (
                  <>
                    <a href="#adherer" className={`mt-5 w-full ${BOUTON_PLEIN}`}>
                      Je veux adhérer
                      <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                    </a>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Le formulaire est plus bas sur cette page.
                    </p>
                  </>
                ) : (
                  <p className="mt-5 rounded-xl bg-brand-50 p-3 text-sm font-medium leading-6 text-slate-600">
                    L’association n’a pas encore publié d’adresse de contact.
                    Parlez-en à un parent de l’équipe à la sortie de l’école.
                  </p>
                )}

                {/* La preuve de cette porte-ci. En face, la carte du coup de
                    main affiche un rendez-vous daté ; sans cela, l'adhésion
                    serait la seule des deux à n'avancer que du texte.
                    Le montant passe devant le RNA quand il est publié : c'est
                    la question que le parent se pose, le RNA ne lui dit rien. */}
                {cotisation ? (
                  <p className="mt-4 rounded-xl border-2 border-slate-200 p-3">
                    <span className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
                      Cotisation annuelle
                    </span>
                    <span className="mt-1 block break-words font-black tracking-[-0.02em] text-brand-950">
                      {cotisation.montant}
                      {cotisation.suffixe ? ` ${cotisation.suffixe}` : ""}
                    </span>
                  </p>
                ) : (
                  rna && (
                    <p className="mt-4 rounded-xl border-2 border-slate-200 p-3">
                      <span className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
                        Association déclarée
                      </span>
                      <span className="mt-1 block break-words font-black tracking-[-0.02em] text-brand-950">
                        RNA {rna}
                      </span>
                    </p>
                  )
                )}
              </div>

              <div className="flex flex-col rounded-2xl bg-white p-5 text-brand-950 sm:p-6">
                {/* Pastille et titre sur la même ligne : les quarante pixels
                    économisés ramènent la seconde porte au-dessus de la ligne de
                    flottaison d'un téléphone courant. */}
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-950"
                  >
                    <Hand className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <h2 className="min-w-0 text-2xl font-black tracking-[-0.03em]">
                    Donner un coup de main
                  </h2>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Venir sur un rendez-vous, le temps qu’on peut. Sans être
                  adhérent.
                </p>
                {ecritureOuverte ? (
                  <>
                    <a href="#coup-de-main" className={`mt-5 w-full ${BOUTON_PLEIN}`}>
                      Je peux aider
                      <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                    </a>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Le formulaire est plus bas sur cette page.
                    </p>
                  </>
                ) : (
                  <a href="#agenda" className={`mt-5 w-full ${BOUTON_PLEIN}`}>
                    Voir les rendez-vous
                    <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                  </a>
                )}

                {/* Le prochain rendez-vous appartient à cette porte-ci : c'est
                    la seule des deux à offrir une action immédiate et datée. */}
                {prochain ? (
                  <Link
                    href={`/inscription/${prochain.jeton}`}
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
                ) : (
                  <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm font-medium leading-6 text-slate-600">
                    Rien de publié en ce moment : la prochaine date apparaîtra
                    ici dès qu’elle est en ligne.
                  </p>
                )}
              </div>
            </div>

            {/* La troisième issue, en texte simple pour ne pas rompre l'égalité
                des deux portes : celui qui sait déjà ne lit rien de plus. */}
            {ecritureOuverte && (
              <p className="mt-5 text-sm font-semibold text-brand-100">
                Vous savez déjà ce que vous voulez ?{" "}
                <a
                  href="#contact"
                  className="inline-flex min-h-11 items-center gap-1.5 font-extrabold text-sea-300 underline underline-offset-4"
                >
                  Écrire directement à l’association
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only"> (plus bas sur cette page)</span>
                </a>
              </p>
            )}

            {events.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t-2 border-brand-800 pt-6 text-sm font-semibold text-brand-100">
                <p>
                  <strong className="text-white">{events.length}</strong>{" "}
                  rendez-vous à venir
                </p>
                {placesOuvertes > 0 ? (
                  <p>
                    <strong className="text-white">{placesOuvertes}</strong>{" "}
                    coup{placesOuvertes > 1 ? "s" : ""} de main recherché
                    {placesOuvertes > 1 ? "s" : ""}
                  </p>
                ) : (
                  <p>Toutes les places sont prises pour l’instant.</p>
                )}
                <a
                  href="#agenda"
                  className="inline-flex min-h-11 items-center gap-2 font-extrabold text-sea-300 underline underline-offset-4"
                >
                  Voir les rendez-vous et les places libres
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* ————— Ce que chacun des deux gestes veut dire, avant d'écrire ————— */}
        <section
          id="deux-facons"
          className="scroll-mt-32 border-b-2 border-slate-100 bg-white py-16 sm:scroll-mt-24 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                Avant de vous décider
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                Ce que ça veut dire, précisément.
              </h2>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <div className="flex flex-col rounded-2xl border-2 border-brand-200 bg-brand-50 p-6 sm:p-8">
                <h3 className="text-2xl font-black tracking-[-0.03em] text-brand-950">
                  Devenir membre
                </h3>
                <ul className="mt-5 space-y-3 text-sm font-medium leading-6 text-slate-700">
                  {puces.map((ligne) => (
                    <li key={ligne} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600"
                      />
                      {ligne}
                    </li>
                  ))}
                </ul>
                {/* Le chiffre en grand, et la marche à suivre juste dessous :
                    c'est la première question d'un parent qui veut adhérer, et
                    la page y répondait par un aller-retour d'e-mail. */}
                {cotisation && (
                  <div className="mt-5 rounded-xl border-2 border-brand-950 bg-white p-4">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                      Cotisation annuelle
                    </p>
                    <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-brand-950">
                      {cotisation.montant}
                      {cotisation.suffixe ? (
                        <span className="ml-2 text-base font-bold tracking-normal text-slate-600">
                          {cotisation.suffixe}
                        </span>
                      ) : null}
                    </p>
                    {cotisation.note && (
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
                        {cotisation.note}
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-5 rounded-xl bg-white p-4 text-sm font-semibold leading-6 text-brand-950">
                  Vous ne savez pas si votre famille est déjà adhérente cette
                  année ? Écrivez-nous, on vérifie.
                </p>
                {ecritureOuverte && (
                  <a
                    href="#adherer"
                    className={`mt-6 w-full sm:mt-auto sm:w-auto sm:self-start ${BOUTON_PLEIN}`}
                  >
                    Demander à adhérer
                    <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                    <span className="sr-only"> (plus bas sur cette page)</span>
                  </a>
                )}
              </div>

              <div className="flex flex-col rounded-2xl border-2 border-sea-300 bg-sea-50 p-6 sm:p-8">
                <h3 className="text-2xl font-black tracking-[-0.03em] text-brand-950">
                  Venir prêter main-forte
                </h3>
                <ul className="mt-5 space-y-3 text-sm font-medium leading-6 text-slate-700">
                  {CE_QUE_LE_COUP_DE_MAIN_VEUT_DIRE.map((ligne) => (
                    <li key={ligne} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sea-700"
                      />
                      {ligne}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 rounded-xl bg-white p-4 text-sm font-semibold leading-6 text-brand-950">
                  Vous ne savez pas encore quand vous serez libre ?
                  Dites-le-nous : on vous prévient quand il manque des bras.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-auto">
                  {ecritureOuverte && (
                    <a href="#coup-de-main" className={`w-full sm:w-auto ${BOUTON_PLEIN}`}>
                      Me signaler
                      <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                      <span className="sr-only"> (plus bas sur cette page)</span>
                    </a>
                  )}
                  <a
                    href="#agenda"
                    className="inline-flex min-h-12 items-center gap-2 px-1 text-sm font-extrabold text-brand-800 underline underline-offset-4 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    Voir les places libres
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>

            <p className="mt-6 rounded-2xl bg-sand-100 px-5 py-5 text-base font-semibold leading-7 text-brand-950">
              On peut adhérer sans jamais tenir un stand, et donner un coup de
              main sans être adhérent. Les deux se choisissent séparément, et
              les deux comptent.
            </p>
          </div>
        </section>

        {/* ————— Le formulaire, remonté ici : plus aucune section ne s'interpose ————— */}
        <section
          id="contact"
          className="scroll-mt-32 bg-slate-50 py-16 sm:scroll-mt-24 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
              {/* Sur téléphone, le formulaire passe devant : l'aside poussé
                  en tête coûtait six cents pixels avant le premier champ, à un
                  parent qui vient précisément pour écrire. En grand écran les
                  deux sont côte à côte et l'ordre redevient naturel. */}
              <aside className="relative order-2 overflow-hidden rounded-2xl bg-brand-950 p-6 text-white sm:p-8 lg:sticky lg:top-28 lg:order-1">
                <div
                  aria-hidden="true"
                  className="absolute -right-12 -top-12 h-36 w-36 rounded-full border-[26px] border-brand-800"
                />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-950">
                    <Mail className="h-4 w-4" strokeWidth={2.5} />
                    Prendre contact
                  </span>
                  <h2 className="mt-6 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                    Ça commence par un bonjour.
                  </h2>
                  <p className="mt-4 text-base font-medium leading-7 text-brand-100">
                    Dites-nous d’abord ce qui vous amène : adhérer, donner un
                    coup de main, ou simplement poser une question. Un parent de
                    l’équipe vous répond par e-mail, comptez quelques jours.
                  </p>

                  {contactEmail && (
                    <p className="mt-6 text-sm font-semibold text-brand-100">
                      Vous préférez votre messagerie ?{" "}
                      <a
                        href={`mailto:${contactEmail}`}
                        className="break-all font-extrabold text-sea-300 underline underline-offset-4"
                      >
                        {contactEmail}
                      </a>
                    </p>
                  )}

                </div>
              </aside>

              <div className="order-1 lg:order-2">
                {/* Les deux portes atterrissent ici. Cibles focalisables : un
                    lecteur d'écran et un clavier suivent le saut, au lieu de
                    rester dans le héros pendant que la page défile. */}
                <div
                  id="adherer"
                  tabIndex={-1}
                  className="scroll-mt-32 outline-none sm:scroll-mt-24"
                />
                <div
                  id="coup-de-main"
                  tabIndex={-1}
                  className="scroll-mt-32 outline-none sm:scroll-mt-24"
                />

                <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
                  {contactEmail ? (
                    <>
                      <h3 className="text-xl font-black tracking-[-0.02em] text-brand-950">
                        Écrire à {settings.associationName}
                      </h3>
                      <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                        Quelques mots suffisent.
                      </p>

                      <div className="mt-5">
                        <JoinForm
                          contactEmail={contactEmail}
                          recaptchaSiteKey={
                            settings.recaptchaReady
                              ? settings.recaptchaSiteKey
                              : null
                          }
                          whatsappGroupUrl={settings.whatsappGroupUrl}
                          cotisationPubliee={settings.membershipFeePublished}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-black tracking-[-0.02em] text-brand-950">
                        Le formulaire n’est pas disponible pour l’instant
                      </h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                        L’association n’a pas encore publié d’adresse de
                        contact : votre message ne partirait nulle part.
                        Repassez d’ici quelques jours, ou parlez-en à un parent
                        de l’équipe à la sortie de l’école.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ————— Respiration : une phrase, un aplat, aucune demande ————— */}
        <section className="relative isolate overflow-hidden bg-sea-200 py-10 sm:py-14">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[26px] border-sea-100"
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <p className="max-w-4xl text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
              Une école qui bouge, ce sont des parents qui s’y mettent.
            </p>
          </div>
        </section>

        {/* ————— La preuve : les rendez-vous réels, où l'on prend un créneau sans compte ————— */}
        <section
          id="agenda"
          className="scroll-mt-32 bg-slate-50 py-16 sm:scroll-mt-24 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                  Les prochaines dates
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                  Choisissez le rendez-vous qui vous arrange.
                </h2>
              </div>
              <p className="max-w-md text-sm font-medium leading-6 text-slate-600">
                Chaque créneau porte un intitulé et le nombre de bénévoles
                attendus. On vous montre tout en arrivant.
              </p>
            </div>

            {prochains.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-brand-200 bg-white px-6 py-14 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
                  <CalendarDays className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-4 font-extrabold text-brand-950">
                  L’agenda fait une pause
                </p>
                <p className="mt-1 max-w-md text-sm font-medium leading-6 text-slate-500">
                  La prochaine date apparaîtra ici
                  {ecritureOuverte
                    ? " ; écrivez-nous, on vous préviendra."
                    : "."}
                </p>
                {ecritureOuverte && (
                  <a href="#coup-de-main" className={`mt-6 ${BOUTON_PLEIN}`}>
                    Prévenez-moi à la prochaine date
                    <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                    <span className="sr-only"> (plus haut sur cette page)</span>
                  </a>
                )}
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {prochains.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/inscription/${event.jeton}`}
                        className="group block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
                      >
                        <article className="flex overflow-hidden rounded-2xl border-2 border-slate-200 bg-white transition-colors group-hover:border-brand-600">
                          <span
                            aria-hidden="true"
                            className={`w-2 shrink-0 ${event.filet}`}
                          />
                          <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 p-5">
                            <p className="flex items-center gap-2 text-sm font-extrabold text-brand-700">
                              <CalendarDays
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {event.date}
                            </p>
                            <h3 className="text-lg font-black leading-tight tracking-[-0.02em] text-brand-950">
                              {event.titre}
                            </h3>
                            {event.lieu && (
                              <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                <MapPin className="h-4 w-4" aria-hidden="true" />
                                {event.lieu}
                              </p>
                            )}
                            <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
                              {event.reunion && (
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral-600 px-2.5 py-1.5 text-xs font-extrabold text-white">
                                  <Users className="h-3.5 w-3.5" />
                                  Réunion
                                </span>
                              )}
                              {event.restantes > 0 && !event.reunion && (
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sea-200 px-2.5 py-1.5 text-xs font-extrabold text-brand-950">
                                  <Hand className="h-3.5 w-3.5" />
                                  {event.restantes} place
                                  {event.restantes > 1 ? "s" : ""}
                                </span>
                              )}
                              <span className="flex items-center gap-2 text-sm font-extrabold text-brand-700">
                                {event.restantes > 0 && !event.reunion
                                  ? "Se proposer"
                                  : "Voir le rendez-vous"}
                                <ArrowUpRight
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                <span className="sr-only">
                                  {" "}
                                  (page du rendez-vous)
                                </span>
                              </span>
                            </div>
                          </div>
                        </article>
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-brand-950 px-5 py-5 text-white sm:px-7">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sea-700">
                    <Hand className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="min-w-0 flex-1 basis-72 text-sm font-semibold leading-6 text-brand-100">
                    On prend son créneau sur la page du rendez-vous. Un lien
                    dans l’e-mail de confirmation le libère si la semaine tourne
                    autrement.
                  </p>
                  {events.length > 3 && (
                    <Link
                      href="/#evenements"
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                    >
                      Voir tous les rendez-vous
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </>
            )}

            {ecritureOuverte && (
              <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-white px-5 py-5 sm:px-7">
                <p className="min-w-0 flex-1 basis-72 text-base font-black tracking-[-0.02em] text-brand-950">
                  Vous préférez adhérer sans prendre de créneau ?
                </p>
                <a href="#adherer" className={BOUTON_PLEIN}>
                  Je veux adhérer
                  <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                  <span className="sr-only"> (plus haut sur cette page)</span>
                </a>
              </div>
            )}
          </div>
        </section>

        {/* ————— Ce qu'on fabrique : le seul bloc qui tient debout sans données ————— */}
        <section className="border-y-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                Une année à l’école
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                Ce qu’on fabrique entre parents.
              </h2>
            </div>

            <ul className="mt-10">
              {MOMENTS.map(({ titre, texte }, index) => (
                <li
                  key={titre}
                  className="grid gap-3 border-t-2 border-slate-200 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[1.05fr_1fr] lg:gap-12"
                >
                  <p className="text-2xl font-black tracking-[-0.03em] text-brand-950 sm:text-3xl">
                    {titre}
                  </p>
                  <div>
                    <span
                      aria-hidden="true"
                      className={`mb-3 block h-2 w-12 rounded-sm ${
                        index % 2 === 0 ? "bg-sea-500" : "bg-brand-700"
                      }`}
                    />
                    <p className="text-base font-medium leading-7 text-slate-600">
                      {texte}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ————— Les missions : la théorie, compacte et rétrogradée ————— */}
        <section className="bg-white pb-16 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl pt-16 sm:pt-20">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                L’association, en bref
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
                Quatre choses qui font l’année.
              </h2>
            </div>

            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MISSIONS.map(({ icon: Icon, numero, titre, texte }, index) => {
                const teinte = TEINTES_MISSIONS[index];
                return (
                  <article
                    key={numero}
                    className={`rounded-2xl p-5 ${teinte.fond}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl ${teinte.pastille}`}
                      >
                        <Icon
                          className="h-5 w-5"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className={`text-sm font-black ${teinte.numero}`}>
                        {numero}
                      </span>
                    </div>
                    <h3 className="mt-6 text-base font-black tracking-[-0.02em]">
                      {titre}
                    </h3>
                    <p
                      className={`mt-2 text-sm font-medium leading-6 ${teinte.texte}`}
                    >
                      {texte}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ————— Le groupe WhatsApp : le canal où tout se suit au fil de l'eau ————— */}
        {settings.whatsappGroupUrl && (
          <section
            id="groupe-whatsapp"
            className="scroll-mt-32 bg-white pb-16 sm:scroll-mt-24 sm:pb-20"
          >
            <div className="mx-auto max-w-4xl px-4 sm:px-6">
              <WhatsappInviteCard
                url={settings.whatsappGroupUrl}
                associationName={settings.associationName}
              />
            </div>
          </section>
        )}

        {/* ————— Rappel final : les deux mêmes portes, pour qui a tout lu ————— */}
        <section className="border-t-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-brand-50 px-5 py-6 sm:px-7">
              <p className="min-w-0 flex-1 basis-72 text-xl font-black tracking-[-0.03em] text-brand-950">
                Deux portes, une seule adresse.
              </p>
              {ecritureOuverte ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a href="#adherer" className={BOUTON_PLEIN}>
                    Je veux adhérer
                    <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                    <span className="sr-only"> (plus haut sur cette page)</span>
                  </a>
                  <a
                    href="#coup-de-main"
                    className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-brand-950 px-5 py-3 text-sm font-extrabold text-brand-950 transition-colors hover:bg-brand-950 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    Je peux aider
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"> (plus haut sur cette page)</span>
                  </a>
                </div>
              ) : (
                <a href="#agenda" className={BOUTON_PLEIN}>
                  Voir les rendez-vous
                  <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                  <span className="sr-only"> (plus haut sur cette page)</span>
                </a>
              )}
            </div>

            <Link
              href="/"
              className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-3 text-sm font-extrabold text-brand-800 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l’accueil
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
