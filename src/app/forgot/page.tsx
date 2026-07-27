import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <AuthShell
      eyebrow="Récupération du compte"
      title="Mot de passe oublié"
      description="Entrez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe."
    >
      <ForgotForm />
    </AuthShell>
  );
}
