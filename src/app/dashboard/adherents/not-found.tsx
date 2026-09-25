import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import { buttonClasses, EmptyState } from "@/components/ui";

/** Une adresse de fiche tronquée, inventée, ou d'une fiche qui n'existe plus. */
export default function AdherentIntrouvable() {
  return (
    <div className="mx-auto max-w-5xl">
      <EmptyState
        icon={SearchX}
        title="Fiche adhérent introuvable"
        description="Cette adresse ne correspond à aucun adhérent. Le lien est peut-être incomplet."
        action={
          <Link href="/dashboard/adherents" className={buttonClasses("primary")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tous les adhérents
          </Link>
        }
      />
    </div>
  );
}
