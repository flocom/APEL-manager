import { cache } from "react";

import { getAssociationDocument } from "@/lib/services/documents";

/**
 * Le document demandé, lu une seule fois par requête : le gabarit s'en sert
 * pour répondre « introuvable » ou rediriger, la page pour l'afficher.
 */
export const chargerDocument = cache(getAssociationDocument);
