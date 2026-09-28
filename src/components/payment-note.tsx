import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

// Adresses http(s) ou commençant par « www. ». La ponctuation finale reste
// dans la phrase : « … sur https://exemple.org. » ne doit pas lier « org. ».
const URL_PATTERN = /(https?:\/\/[^\s<>"«»]+|www\.[^\s<>"«»]+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

type Segment = { text: string } | { href: string; label: string };

function toHref(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Découpe la phrase saisie par le bureau en texte et en liens. Le libellé d'un
 * lien est son seul domaine : une adresse de paiement en ligne fait souvent
 * cent caractères, et personne ne la lit.
 */
export function splitPaymentNote(note: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of note.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0].replace(TRAILING_PUNCTUATION, "");
    const href = toHref(raw);
    if (!href) continue;
    if (start > cursor) segments.push({ text: note.slice(cursor, start) });
    segments.push({
      href,
      label: new URL(href).hostname.replace(/^www\./, ""),
    });
    cursor = start + raw.length;
  }
  if (cursor < note.length) segments.push({ text: note.slice(cursor) });
  return segments;
}

/**
 * « Comment régler », tel que les parents le lisent : un lien saisi dans la
 * phrase devient cliquable, et le premier ouvre en plus un bouton « Régler en
 * ligne » — c'est l'action qu'on attend d'eux, elle ne doit pas se cacher au
 * milieu d'une ligne de texte.
 */
export function PaymentNote({
  note,
  className,
}: {
  note: string;
  className?: string;
}) {
  const segments = splitPaymentNote(note);
  const firstLink = segments.find(
    (segment): segment is { href: string; label: string } => "href" in segment,
  );
  // Une phrase réduite à son lien — le cas le plus courant : on colle
  // l'adresse HelloAsso et c'est tout — n'a rien à dire que le bouton ne dise
  // déjà. Répéter « helloasso.com » au-dessus ferait doublon.
  const linkOnly =
    firstLink !== undefined &&
    segments.every((segment) =>
      "href" in segment ? segment === firstLink : segment.text.trim() === "",
    );

  return (
    <>
      {!linkOnly && (
        <p className={cn("break-words", className)}>
          {segments.map((segment, index) =>
            "href" in segment ? (
              <a
                key={index}
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-brand-700 underline underline-offset-2 hover:text-brand-900"
              >
                {segment.label}
              </a>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      )}
      {firstLink && (
        <a
          href={firstLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          Régler en ligne
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">
            (sur {firstLink.label}, nouvel onglet)
          </span>
        </a>
      )}
    </>
  );
}
