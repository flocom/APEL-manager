"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Sommaire des longues pages de réglages (Configuration, Mon compte).
 *
 * Sur grand écran, une colonne qui reste en place pendant qu'on fait défiler
 * la page ; sur téléphone, une rangée d'onglets collée sous l'en-tête. Dans
 * les deux cas, l'entrée de la section affichée s'allume : on sait où l'on
 * est sans remonter en haut de la page.
 *
 * Les sections sont de simples éléments portant l'`id` de l'entrée : les
 * liens restent des ancres (`/dashboard/settings#helloasso`), partageables
 * et utilisables sans JavaScript.
 */
export type SettingsNavItem = {
  id: string;
  label: string;
  /** Titre du groupe ; les entrées consécutives d'un même groupe sont réunies. */
  group?: string;
  /**
   * Pastille d'état : `ok` (en service), `warning` (à régler), `off`
   * (désactivé). Absent : pas de pastille.
   */
  status?: "ok" | "warning" | "off";
  /** Ce que dit la pastille, pour les lecteurs d'écran et l'infobulle. */
  statusLabel?: string;
};

const STATUS_DOT: Record<NonNullable<SettingsNavItem["status"]>, string> = {
  ok: "bg-sea-500",
  warning: "bg-amber-500",
  off: "bg-slate-300",
};

// Hauteur de l'en-tête mobile, si on ne peut pas la mesurer.
const MOBILE_HEADER_FALLBACK = 73;
// Une section devient « la section affichée » quand son haut passe sous
// cette ligne (en pixels depuis le haut de la zone qui défile). Sur
// téléphone, une section rejointe par le sommaire s'arrête à 144 px du haut
// (`scroll-mt-36`, sous l'en-tête et les onglets) : la ligne passe dessous.
const ACTIVE_LINE = 170;

/**
 * La zone qui défile : sur ordinateur, la colonne principale ; sur
 * téléphone, la page (`null`).
 */
function scrollerOf(element: HTMLElement) {
  const main = element.closest("main");
  return main !== null && main.scrollHeight > main.clientHeight + 1
    ? main
    : null;
}

function groupsOf(items: SettingsNavItem[]) {
  const groups: { title?: string; items: SettingsNavItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.title === item.group) last.items.push(item);
    else groups.push({ title: item.group, items: [item] });
  }
  return groups;
}

function StatusDot({ item }: { item: SettingsNavItem }) {
  if (!item.status) return null;
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[item.status])}
      title={item.statusLabel}
    >
      {item.statusLabel && <span className="sr-only">{item.statusLabel}</span>}
    </span>
  );
}

export function SettingsNav({
  items,
  label = "Sommaire",
}: {
  items: SettingsNavItem[];
  label?: string;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [headerHeight, setHeaderHeight] = useState(MOBILE_HEADER_FALLBACK);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Pendant un défilement lancé par un clic, l'entrée cliquée reste allumée :
  // sinon les sections traversées la feraient clignoter.
  const lockRef = useRef<{ id: string; until: number } | null>(null);

  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    const sectionIds = ids.split(" ").filter(Boolean);
    let frame = 0;

    function compute() {
      frame = 0;
      const lock = lockRef.current;
      if (lock && Date.now() < lock.until) {
        setActive(lock.id);
        return;
      }
      lockRef.current = null;
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (sections.length === 0) return;
      // Sur ordinateur, c'est la colonne principale qui défile ; sur
      // téléphone, la page. La ligne se mesure depuis le haut de la zone
      // visible, en-tête mobile compris.
      const scroller = scrollerOf(sections[0]);
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
        : window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4;
      let current = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top - top <= ACTIVE_LINE) {
          current = section.id;
        }
      }
      // Tout en bas, la dernière section est trop courte pour atteindre la
      // ligne : c'est pourtant elle qu'on lit.
      if (atBottom) current = sections[sections.length - 1].id;
      setActive(current);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(compute);
    }

    compute();
    // En capture : le défilement de la colonne principale ne remonte pas
    // jusqu'au document.
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  // La rangée d'onglets se colle sous l'en-tête mobile, dont la hauteur
  // dépend du nom de l'association et du logo.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-mobile-header]");
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // L'onglet de la section affichée reste visible dans la rangée.
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-nav-id="${active}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft + 16 || left + chip.offsetWidth > row.scrollLeft + row.clientWidth - 16) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
    }
  }, [active]);

  const go = useCallback((event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lockRef.current = { id, until: Date.now() + (reduce ? 100 : 900) };
    setActive(id);
    const behavior = reduce ? "auto" : "smooth";
    const scroller = scrollerOf(target);
    if (scroller) {
      // Sur ordinateur, seule la colonne défile. `scrollIntoView` ferait
      // défiler tous les ancêtres, page comprise : arrivée en butée avec une
      // section trop courte pour remonter en haut (la dernière), la colonne
      // passerait la main à la page, qui glisserait sous la barre latérale.
      const marge = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      scroller.scrollTo({
        top:
          scroller.scrollTop +
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          marge,
        behavior,
      });
    } else {
      target.scrollIntoView({ behavior, block: "start" });
    }
    window.history.replaceState(null, "", `#${id}`);
    // Le focus suit, pour le clavier et les lecteurs d'écran, sans
    // redéclencher de défilement.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, []);

  const groups = groupsOf(items);

  return (
    <>
      {/* Téléphone et tablette : onglets collés sous l'en-tête. */}
      <nav
        aria-label={label}
        className="sticky z-20 -mx-4 overflow-hidden border-b-2 border-slate-200 bg-slate-50/95 backdrop-blur sm:-mx-7 lg:hidden"
        style={{ top: headerHeight }}
      >
        <div
          ref={chipsRef}
          className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-7 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              data-nav-id={item.id}
              onClick={(event) => go(event, item.id)}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 px-3.5 text-sm font-semibold transition-colors",
                active === item.id
                  ? "border-brand-950 bg-brand-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-300",
              )}
            >
              {item.label}
              <StatusDot item={item} />
            </a>
          ))}
        </div>
      </nav>

      {/* Grand écran : colonne fixe à gauche du contenu. */}
      <nav
        aria-label={label}
        className="sticky top-0 hidden max-h-[calc(100vh-5rem)] self-start overflow-y-auto pb-4 lg:block"
      >
        <div className="space-y-5">
          {groups.map((group, index) => (
            <div key={`${group.title ?? ""}-${index}`}>
              {group.title && (
                <p className="mb-1.5 px-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(event) => go(event, item.id)}
                      aria-current={active === item.id ? "location" : undefined}
                      className={cn(
                        "relative flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                        active === item.id
                          ? "bg-white text-brand-950 shadow-sm ring-2 ring-brand-100"
                          : "text-slate-600 hover:bg-white hover:text-brand-950",
                      )}
                    >
                      {active === item.id && (
                        <span
                          className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand-700"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 truncate">{item.label}</span>
                      <StatusDot item={item} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

