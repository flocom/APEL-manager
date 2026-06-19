import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-slate-900"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            A
          </span>
          APEL Manager
        </Link>
        <Card className="p-6">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Connexion</h1>
          <p className="mb-5 text-sm text-slate-500">
            Accédez à votre espace de gestion.
          </p>
          <LoginForm />
        </Card>
      </div>
    </div>
  );
}
