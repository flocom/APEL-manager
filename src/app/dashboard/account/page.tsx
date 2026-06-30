import { Settings } from "lucide-react";

import { AccountForm } from "@/components/account-form";
import { PasswordChangeForm } from "@/components/password-change-form";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_LABELS, requireUser } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Mon compte"
        description="Vos informations et préférences de notification."
        icon={Settings}
      />

      <Card className="p-6">
        <dl className="mb-6 grid grid-cols-2 gap-4 border-b border-slate-100 pb-6 text-sm">
          <div>
            <dt className="text-slate-400">Adresse e-mail</dt>
            <dd className="font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Rôle</dt>
            <dd className="font-medium text-slate-900">{ROLE_LABELS[user.role]}</dd>
          </div>
        </dl>
        <AccountForm name={user.name} telegramChatId={user.telegramChatId} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Sécurité</h2>
        <PasswordChangeForm />
      </Card>
    </div>
  );
}
