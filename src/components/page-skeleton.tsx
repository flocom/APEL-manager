import { Skeleton } from "@/components/ui";

/** Squelette de chargement générique : en-tête + blocs de contenu. */
export function PageSkeleton({
  rows = 3,
  grid = false,
}: {
  rows?: number;
  grid?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className={grid ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
