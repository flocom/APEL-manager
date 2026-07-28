import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getAssociationSettings(),
  ]);
  if (user) redirect("/dashboard");

  return (
    <AuthShell
      eyebrow="Rejoindre l’équipe"
      title="Créer un compte"
      description={`Le premier compte créé devient administrateur de l’espace ${settings.associationName}.`}
    >
      <RegisterForm />
    </AuthShell>
  );
}
