import { Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
