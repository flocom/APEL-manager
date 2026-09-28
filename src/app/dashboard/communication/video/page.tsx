import { ArrowLeft, Clapperboard } from "lucide-react";
import Link from "next/link";

import { ClassVideoEditor } from "@/components/communication/class-video-editor";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import {
  getClassVideo,
  getClassVideoSource,
  getTtsSettings,
} from "@/lib/services/communication";

export const dynamic = "force-dynamic";

export default async function ParentVideoPage() {
  await requireRole("admin");
  const [video, source, tts] = await Promise.all([
    getClassVideo(),
    getClassVideoSource(),
    getTtsSettings(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/dashboard/communication"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Supports de communication
      </Link>
      <PageHeader
        title="Vidéo de présentation aux parents"
        description="Une vidéo en motion design à projeter en réunion de rentrée ou à partager aux familles : l’APEL donne vie à l’école, fait sourire les enfants, crée des souvenirs et rassemble. Tout est déjà rédigé ; ajoutez vos photos et la voix off, puis exportez."
        icon={Clapperboard}
      />
      <ClassVideoEditor
        initialContent={video.content}
        source={source}
        initialTts={tts}
      />
    </div>
  );
}
