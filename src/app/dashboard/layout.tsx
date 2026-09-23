import { DashboardNav } from "@/components/dashboard-nav";
import { PushBanner } from "@/components/push-banner";
import { WelcomeTour } from "@/components/welcome-tour";
import { canManageUsers, requireUser } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { countPendingAccounts } from "@/lib/services/user-accounts";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, settings] = await Promise.all([
    requireUser(),
    getAssociationSettings(),
  ]);
  // Compté à chaque page pour les seuls administrateurs : ce sont eux qui
  // valident, et le nombre de demandes n'a pas à circuler plus loin.
  const pendingAccounts = canManageUsers(user)
    ? await countPendingAccounts()
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <DashboardNav
        appName={settings.associationName}
        logoUrl={settings.logoUrl}
        user={{ name: user.name, role: user.role }}
        pendingAccounts={pendingAccounts}
      />
      <main className="flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:h-screen lg:overflow-y-auto lg:px-10 lg:py-10 xl:px-12">
        <div className="mx-auto max-w-7xl space-y-6">
          <PushBanner accountEnabled={user.pushEnabled} />
          {children}
        </div>
      </main>
      <WelcomeTour autoStart={user.onboardingSeenAt === null} />
    </div>
  );
}
