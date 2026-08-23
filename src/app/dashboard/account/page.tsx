import { Settings } from "lucide-react";

import { AccountForm } from "@/components/account-form";
import { PasswordChangeForm } from "@/components/password-change-form";
import { PushToggle } from "@/components/push-toggle";
import { ReplayTourButton } from "@/components/replay-tour-button";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_LABELS, requireUser } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [user, settings] = await Promise.all([
    requireUser(),
    getAssociationSettings(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Mon compte"
        description="Vos informations et préférences de notification."
        icon={Settings}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <dl className="mb-6 grid grid-cols-2 gap-4 border-b border-slate-100 pb-6 text-sm">
            <div>
              <dt className="text-slate-400">Adresse e-mail</dt>
              <dd className="font-medium text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Rôle</dt>
              <dd className="font-medium text-slate-900">
                {ROLE_LABELS[user.role]}
              </dd>
            </div>
          </dl>
          <AccountForm
            name={user.name}
            telegramChatId={user.telegramChatId}
            telegramReady={settings.telegramReady}
            telegramBotUsername={settings.telegramBotUsername}
          />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Sécurité</h2>
          <PasswordChangeForm />
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Notifications sur appareil
          </h2>
          <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">
            Les messages de l’association arrivent sur votre téléphone ou votre
            ordinateur, même quand le site est fermé.
          </p>
          <PushToggle enabled={user.pushEnabled} />
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Découverte</h2>
          <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">
            Le petit guide qui présente chaque page du tableau de bord, une
            bulle à la fois.
          </p>
          <ReplayTourButton />
        </Card>
      </div>
    </div>
  );
}
