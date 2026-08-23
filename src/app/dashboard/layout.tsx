import { DashboardNav } from "@/components/dashboard-nav";
import { PushBanner } from "@/components/push-banner";
import { WelcomeTour } from "@/components/welcome-tour";
import { requireUser } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";

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

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <DashboardNav
        appName={settings.associationName}
        logoUrl={settings.logoUrl}
        user={{ name: user.name, role: user.role }}
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
