import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import { buttonClasses, EmptyState } from "@/components/ui";

/** Une adresse de document tronquée, inventée, ou d'un document supprimé. */
export default function DocumentIntrouvable() {
  return (
    <div className="mx-auto max-w-5xl">
      <EmptyState
        icon={SearchX}
        title="Document introuvable"
        description="Cette adresse ne correspond à aucun document. Le lien est peut-être incomplet, ou le document a été supprimé."
        action={
          <Link href="/dashboard/documents" className={buttonClasses("primary")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tous les documents
          </Link>
        }
      />
    </div>
  );
}
