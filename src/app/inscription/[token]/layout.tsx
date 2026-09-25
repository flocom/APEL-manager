import { notFound } from "next/navigation";

import { getEventByShareToken } from "@/lib/data";

import { visibilite } from "./visibilite";

/**
 * Un lien inconnu, ou celui d'un rendez-vous qui n'est pas ouvert (brouillon,
 * archivé), répond un vrai 404, avec l'écran « Lien d'inscription
 * indisponible » (inscription/not-found.tsx).
 *
 * Vérifié ici, AVANT le squelette de chargement de la page : sous cette
 * frontière, la réponse serait déjà partie en 200. La page relit le
 * rendez-vous sans nouvelle requête (`cache()`). Un brouillon et un jeton
 * inconnu restent indiscernables : même statut, même écran.
 */
export default async function InscriptionLayout({
  params,
  children,
}: {
  params: Promise<{ token: string }>;
  children: React.ReactNode;
}) {
  const { token } = await params;
  if (visibilite(await getEventByShareToken(token)) === "indisponible") {
    notFound();
  }
  return children;
}
