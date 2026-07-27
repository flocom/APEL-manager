import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <AuthShell
      eyebrow="Rejoindre l’équipe"
      title="Créer un compte"
      description="Le premier compte créé devient administrateur de l’espace APEL."
    >
      <RegisterForm />
    </AuthShell>
  );
}
