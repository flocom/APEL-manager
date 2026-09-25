import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import { buttonClasses, EmptyState } from "@/components/ui";

/** Une adresse d'événement tronquée, inventée, ou d'un événement supprimé. */
export default function EvenementIntrouvable() {
  return (
    <div className="mx-auto max-w-5xl">
      <EmptyState
        icon={SearchX}
        title="Événement introuvable"
        description="Cette adresse ne correspond à aucun événement. Le lien est peut-être incomplet, ou l’événement a été supprimé."
        action={
          <Link href="/dashboard/events" className={buttonClasses("primary")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tous les événements
          </Link>
        }
      />
    </div>
  );
}
