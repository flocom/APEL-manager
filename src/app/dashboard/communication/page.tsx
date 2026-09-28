import { ChevronRight, Clapperboard, Megaphone } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** Les supports de communication que l'application sait préparer. */
export default async function CommunicationPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Supports de communication"
        description="Des supports prêts à l’emploi, préparés à partir de ce que l’application sait déjà de l’association : son nom, son logo, ses événements, son équipe."
        icon={Megaphone}
      />

      <Link
        href="/dashboard/communication/video"
        className="group flex items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:p-6"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-coral-600 text-white">
          <Clapperboard className="h-7 w-7" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold text-slate-950">
            Vidéo de présentation aux parents
          </span>
          <span className="mt-1 block text-sm leading-6 text-slate-500">
            Une vidéo en motion design pour présenter l’APEL aux familles —
            donner vie à l’école, faire sourire les enfants, créer des
            souvenirs, rassembler — et leur donner envie de nous rejoindre.
            Photos, musique et voix off comprises.
          </span>
        </span>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-brand-700"
          aria-hidden="true"
        />
      </Link>

      <p className="text-sm text-slate-500">
        D’autres supports viendront s’ajouter ici.
      </p>
    </div>
  );
}
