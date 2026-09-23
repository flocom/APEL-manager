import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "@/components/auth-forms";
import { safeNextPath } from "@/lib/auth/return-path";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mot de passe oublié" };

export default async function ForgotPage({
  searchParams,
}: {
  // Seulement pour « Retour à la connexion » : le lien de réinitialisation,
  // lui, part par e-mail et ne l'emporte pas.
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell
      eyebrow="Récupération du compte"
      title="Mot de passe oublié"
      description="Entrez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe."
    >
      <ForgotForm next={safeNextPath(next)} />
    </AuthShell>
  );
}
