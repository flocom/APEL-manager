import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { CancelSignup } from "@/components/cancel-signup";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";
import { getSignupByCancelToken } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const signup = await getSignupByCancelToken(token);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12">
        <Card className="w-full p-8">
          {!signup ? (
            <div className="text-center text-slate-600">
              <p className="text-lg font-medium text-slate-900">
                Lien invalide
              </p>
              <p className="mt-2 text-sm">
                Cette inscription n'existe pas ou a déjà été annulée.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block text-brand-600 hover:underline"
              >
                Retour à l'accueil
              </Link>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Annuler mon inscription
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Vous êtes inscrit·e comme bénévole pour :
              </p>
              <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">
                  {signup.slot.event.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-brand-700">
                  <CalendarDays className="h-4 w-4" />
                  {formatDateTime(signup.slot.event.startAt)}
                </p>
                <p className="mt-1 text-slate-600">
                  Créneau : {signup.slot.title}
                </p>
              </div>
              <p className="mt-4 mb-3 text-sm text-slate-600">
                Confirmez-vous vouloir vous désinscrire ?
              </p>
              <CancelSignup token={token} />
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
