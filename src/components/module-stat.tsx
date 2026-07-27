import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const tones = {
  brand: {
    shell: "border-brand-200 bg-brand-50",
    icon: "bg-brand-700 text-white",
  },
  sea: {
    shell: "border-sea-200 bg-sea-50",
    icon: "bg-sea-600 text-white",
  },
  coral: {
    shell: "border-coral-200 bg-coral-50",
    icon: "bg-coral-700 text-white",
  },
  slate: {
    shell: "border-slate-200 bg-white",
    icon: "bg-brand-950 text-white",
  },
} as const;

export function ModuleStat({
  label,
  value,
  helper,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  helper?: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
}) {
  const colors = tones[tone];

  return (
    <div
      className={cn(
        "flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4",
        colors.shell,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
          colors.icon,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold tabular-nums tracking-tight text-brand-950">
          {value}
        </p>
        <p className="text-sm font-bold text-slate-700">{label}</p>
        {helper && <p className="mt-0.5 text-xs text-slate-500">{helper}</p>}
      </div>
    </div>
  );
}
