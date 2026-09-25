/**
 * Ce que la page peut dire d'un rendez-vous, selon son état. Une seule règle
 * pour le corps de la page et pour ses métadonnées (titre de l'onglet, aperçu
 * OpenGraph) : écrites deux fois, elles avaient divergé, et l'aperçu d'un lien
 * de brouillon affichait ce que la page taisait.
 *
 * Un brouillon ne dit jamais rien, même annulé : il n'a jamais été public, et
 * personne n'a de raison d'en connaître le titre.
 */
export function visibilite(
  event: { status: string; cancelledAt: Date | null } | null | undefined,
): "annule" | "indisponible" | "ouvert" {
  if (!event || event.status === "draft") return "indisponible";
  if (event.cancelledAt) return "annule";
  return event.status === "published" ? "ouvert" : "indisponible";
}
