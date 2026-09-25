import { notFound } from "next/navigation";

import { getEventWithDetails } from "@/lib/data";

/**
 * Les présences n'existent que pour une réunion. Vérifié ici, hors du
 * squelette de chargement de l'onglet, pour que l'adresse d'un autre
 * événement réponde un vrai 404. Lecture partagée (`cache()`) avec le
 * gabarit des onglets et la page.
 */
export default async function PresencesLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const event = await getEventWithDetails(id);
  if (!event || event.kind !== "meeting") notFound();
  return children;
}
