import { cache } from "react";

import { getAssociationMember } from "@/lib/services/adherents";
import { isUuid } from "@/lib/utils";

/**
 * La fiche demandée, lue une seule fois par requête : le gabarit s'en sert
 * pour répondre « introuvable », la page pour l'afficher.
 *
 * Une adresse tronquée ou inventée ne désigne aucun adhérent : on n'interroge
 * pas la base, qui échouerait sur la syntaxe de l'identifiant.
 */
export const chargerAdherent = cache(async (id: string) =>
  isUuid(id) ? getAssociationMember(id) : null,
);
