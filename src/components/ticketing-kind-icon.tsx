import {
  CreditCard,
  HandHeart,
  IdCard,
  ShoppingBag,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import type { TicketingKind } from "@/lib/ticketing";

/**
 * Pictogramme de chaque usage du lien en ligne.
 *
 * Rangé à part de `src/lib/ticketing.ts`, qui reste un module sans React : la
 * validation de l'API l'importe aussi. Un ticket devant une boutique disait
 * « entrée » aussi sûrement que le mot « Réserver ».
 */
export const TICKETING_KIND_ICONS: Record<TicketingKind, LucideIcon> = {
  billetterie: Ticket,
  boutique: ShoppingBag,
  don: HandHeart,
  adhesion: IdCard,
  paiement: CreditCard,
};
