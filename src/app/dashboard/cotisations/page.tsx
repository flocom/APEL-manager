import { redirect } from "next/navigation";

/**
 * L'écran « Cotisations » a fusionné avec « Adhérents » : le règlement d'une
 * adhésion est une information de l'adhérent, pas d'une liste à part.
 *
 * La redirection reste, plutôt qu'une suppression sèche : l'adresse a pu être
 * mise en favori, et un lien mort vaut moins qu'un détour invisible.
 */
export default function CotisationsPage() {
  redirect("/dashboard/adherents");
}
