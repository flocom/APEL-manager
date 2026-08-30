import {
  ArrowUpRight,
  CalendarDays,
  HandHeart,
  Megaphone,
  MessageCircle,
} from "lucide-react";

/**
 * Carton d'invitation au groupe WhatsApp de l'association.
 *
 * L'aperçu de conversation est une illustration, et il est cadré comme telle :
 * la légende « Exemple de ce qui circule dans le groupe » est visible et placée
 * avant les bulles, de sorte que personne — voyant ou non — ne puisse prendre
 * ces trois phrases pour des messages réellement envoyés. Pas d'horodatage, pas
 * de double coche, pas de prénom, pas d'émoticône : une seule voix, celle de
 * l'association, et rien qui ressemble à une capture d'écran.
 *
 * Le vert de la marque n'apparaît qu'aux deux endroits où il signifie WhatsApp
 * — le sceau et le bouton — et porte une encre bleu nuit : du blanc sur ce vert
 * tomberait à 1,98:1, la « correction » que tout relecteur propose au premier
 * coup d'œil. Le reste est la palette du site.
 */

const APERCU = [
  {
    icon: CalendarDays,
    texte: "Les dates des rendez-vous, avec un rappel avant le jour J.",
    largeur: "max-w-[26rem]",
  },
  {
    icon: Megaphone,
    texte: "Les changements de dernière minute, annoncés là où on les lit vite.",
    largeur: "max-w-[30rem]",
  },
  {
    icon: HandHeart,
    texte: "Les coups de main cherchés, quand il manque quelqu’un sur un créneau.",
    largeur: "max-w-[24rem]",
  },
];

export function WhatsappInviteCard({
  url,
  associationName,
}: {
  url: string;
  associationName: string;
}) {
  return (
    <article className="group/carton relative isolate overflow-hidden rounded-3xl bg-sea-900 px-6 py-9 text-white sm:px-10 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-14 -top-20 h-40 w-40 rounded-full border-[28px] border-white/10 sm:-right-20 sm:-top-24 sm:h-64 sm:w-64 sm:border-[36px]" />
        <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-sea-800" />
      </div>
      {/* Double filet : la signature du carton gravé. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 rounded-[18px] border border-white/15 sm:inset-4 sm:rounded-[20px]"
      />

      <div className="relative z-10">
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-8">
          <span
            aria-hidden="true"
            className="grid h-16 w-16 shrink-0 -rotate-6 place-items-center rounded-2xl bg-[#25D366] text-brand-950 ring-4 ring-white/10 motion-safe:transition-transform motion-safe:duration-300 sm:h-20 sm:w-20 sm:group-hover/carton:rotate-0"
          >
            <MessageCircle className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={2.5} />
          </span>

          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sea-200">
              Vous êtes invités
            </p>
            <h2 className="mt-2 break-words text-3xl font-black leading-[1.05] tracking-[-0.035em] [hyphens:auto] sm:text-4xl">
              Toutes les infos, dans un seul groupe WhatsApp
            </h2>
            <p className="mt-4 max-w-xl text-base font-medium leading-7 text-sea-100">
              {associationName} tient un groupe WhatsApp ouvert aux familles.
              Les dates, les rappels, les changements de dernière minute et les
              coups de main cherchés y sont annoncés : vous suivez ce qui se
              prépare sans avoir à le chercher.
            </p>
          </div>
        </div>

        <figure className="mt-8 sm:mt-10 sm:pl-28">
          <figcaption className="text-xs font-extrabold uppercase tracking-[0.16em] text-sea-200">
            Exemple de ce qui circule dans le groupe.
          </figcaption>
          <ul className="mt-4 space-y-3">
            {APERCU.map(({ icon: Icon, texte, largeur }) => (
              <li
                key={texte}
                className={`relative w-fit ${largeur} rounded-2xl rounded-bl-md bg-white px-4 py-3`}
              >
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 left-3.5 h-3 w-3 rotate-45 rounded-[2px] bg-white"
                />
                <span className="relative flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sea-100 text-sea-800"
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm font-medium leading-6 text-slate-700">
                    {texte}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </figure>

        <div className="mt-8 sm:mt-10">
          <div
            aria-hidden="true"
            className="-mx-6 border-t-2 border-dashed border-white/25 sm:-mx-10"
          />
          <div className="pt-7 sm:flex sm:items-center sm:gap-6">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3 text-center text-base font-black tracking-[-0.01em] text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sea-900 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 sm:w-auto sm:px-6"
            >
              Rejoindre le groupe WhatsApp
              <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
              <ArrowUpRight className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
            </a>

            <p className="mt-4 max-w-sm text-xs font-semibold leading-5 text-sea-200 sm:mt-0">
              Votre numéro sera visible des autres membres du groupe, et vous
              pouvez en sortir quand vous voulez. Pas de WhatsApp ?{" "}
              <a
                href="#contact"
                className="rounded font-bold text-white underline underline-offset-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sea-900"
              >
                Écrivez-nous
              </a>{" "}
              plutôt.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
