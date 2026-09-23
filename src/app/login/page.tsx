import { CircleCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { safeNextPath } from "@/lib/auth/return-path";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    reset?: string | string[];
    next?: string | string[];
  }>;
}) {
  const { reset, next } = await searchParams;
  const destination = safeNextPath(next);
  const user = await getCurrentUser();
  if (user) redirect(destination);

  return (
    <AuthShell
      eyebrow="Bon retour"
      title="Connexion"
      description="Retrouvez votre espace de gestion et les prochains rendez-vous de l’équipe."
    >
      {reset === "1" && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800"
        >
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de
            passe.
          </p>
        </div>
      )}
      <LoginForm next={destination} />
    </AuthShell>
  );
}
