import Link from "next/link";

import { ResetForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { APP_INITIAL, APP_NAME } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-slate-900"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            {APP_INITIAL}
          </span>
          {APP_NAME}
        </Link>
        <Card className="p-6">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">
            Nouveau mot de passe
          </h1>
          <p className="mb-5 text-sm text-slate-500">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
          <ResetForm token={token} />
        </Card>
      </div>
    </div>
  );
}
