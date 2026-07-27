import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthShell
      eyebrow="Sécurité du compte"
      title="Nouveau mot de passe"
      description="Choisissez un nouveau mot de passe pour retrouver votre espace."
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
