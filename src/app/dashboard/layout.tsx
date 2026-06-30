import { DashboardNav } from "@/components/dashboard-nav";
import { requireUser } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen lg:flex">
      <DashboardNav user={{ name: user.name, role: user.role }} />
      <main className="flex-1 px-4 py-6 sm:px-8 lg:h-screen lg:overflow-y-auto lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
