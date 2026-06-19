import { AccountForm } from "@/components/account-form";
import { Card } from "@/components/ui";
import { ROLE_LABELS, requireUser } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mon compte</h1>
        <p className="text-slate-500">Vos informations et préférences de notification.</p>
      </div>

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
    </div>
  );
}
