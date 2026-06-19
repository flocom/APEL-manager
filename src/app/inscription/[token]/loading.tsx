import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}
