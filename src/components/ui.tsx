import { Loader2, type LucideIcon } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

/** Style commun aux champs de saisie (input, textarea, select). */
const fieldClasses =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base shadow-sm sm:text-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500";

type Variant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "danger"
  | "ghost";
type Size = "sm" | "md";

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
  const sizes: Record<Size, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
  };
  const variants: Record<Variant, string> = {
    primary:
      "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm hover:shadow-buoy hover:-translate-y-0.5",
    accent:
      "bg-gradient-to-b from-coral-400 to-coral-500 text-white shadow-sm hover:shadow-buoy hover:-translate-y-0.5",
    secondary: "bg-slate-800 text-white shadow-sm hover:bg-slate-900",
    outline:
      "border border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/60",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return cn(base, sizes[size], variants[variant]);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClasses(variant, size), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(fieldClasses, className)} {...props} />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(fieldClasses, className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClasses, className)} {...props} />
  );
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

/** Champ de formulaire : label + contenu + indice / erreur. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

const badgeColors = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-sand-100 text-sand-800",
  red: "bg-coral-100 text-coral-700",
  blue: "bg-brand-100 text-brand-700",
  sea: "bg-sea-100 text-sea-700",
  coral: "bg-coral-100 text-coral-700",
} as const;

export function Badge({
  color = "slate",
  icon: Icon,
  className,
  children,
}: {
  color?: keyof typeof badgeColors;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeColors[color],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** En-tête de page : icône optionnelle, titre, description, actions à droite. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-sea-500 text-white shadow-buoy">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-gradient-to-b from-brand-50/50 to-sea-50/40 px-6 py-12 text-center">
      <span className="grid h-14 w-14 animate-float place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-sea-100 text-brand-600 shadow-sm">
        <Icon className="h-7 w-7" />
      </span>
      <p className="mt-4 font-semibold text-slate-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const statTones = {
  brand: "text-white bg-gradient-to-br from-brand-500 to-sea-500",
  slate: "text-slate-700 bg-slate-100",
  red: "text-white bg-gradient-to-br from-coral-400 to-coral-500",
  green: "text-white bg-gradient-to-br from-emerald-400 to-sea-500",
  sand: "text-white bg-gradient-to-br from-sand-300 to-sand-500",
} as const;

export function Stat({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof statTones;
}) {
  return (
    <Card className="flex items-center gap-4 p-4">
      {Icon && (
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-sm",
            statTones[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-gradient-to-r from-brand-100/60 via-slate-200/70 to-sea-100/60",
        className,
      )}
    />
  );
}
