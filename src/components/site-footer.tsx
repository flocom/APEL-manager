import { Github } from "lucide-react";
import Link from "next/link";

import { PROJECT_REPOSITORY_URL } from "@/lib/app-config";
import { getAssociationSettings } from "@/lib/services/association-settings";

/** Pied de page commun aux écrans publics. */
export async function SiteFooter() {
  const settings = await getAssociationSettings();

  return (
    <footer className="bg-brand-950 py-8 text-sm text-brand-200">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-sea-500" aria-hidden="true" />
          <p className="font-semibold">
            {settings.associationName} — ensemble, pour nos enfants.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link
            href="/confidentialite"
            className="rounded-md font-bold text-white transition-colors hover:text-sea-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-700"
          >
            Politique de confidentialité
          </Link>
          <a
            href={PROJECT_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md font-bold text-white transition-colors hover:text-sea-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-700"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            Code source du site
          </a>
        </div>
      </div>
    </footer>
  );
}
