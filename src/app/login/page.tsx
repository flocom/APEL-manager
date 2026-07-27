import { CircleCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | string[] | undefined): string {
  if (
    typeof value !== "string" ||
    value.length > 4_096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/dashboard";
  }

  try {
    const base = new URL("https://apel.local");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

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
