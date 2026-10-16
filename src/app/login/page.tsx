import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { AuthTabs } from "@/components/auth-tabs";
import { safeNextPath } from "@/lib/auth/return-path";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  const { next } = await searchParams;
  const destination = safeNextPath(next);
  const user = await getCurrentUser();
  if (user) redirect(destination);

  return (
    <AuthShell
      eyebrow="Mon compte"
      title="Connexion"
      description="Retrouvez vos tâches et les prochains rendez-vous de l’équipe."
      tabs={<AuthTabs active="login" next={destination} />}
    >
      <LoginForm next={destination} />
    </AuthShell>
  );
}
