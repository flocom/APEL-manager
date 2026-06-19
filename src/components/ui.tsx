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

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md";

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes: Record<Size, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
  };
  const variants: Record<Variant, string> = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
    secondary: "bg-slate-800 text-white shadow-sm hover:bg-slate-900",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
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
    <input
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...props}
    />
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
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
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
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

const badgeColors = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-brand-100 text-brand-700",
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
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-medium text-slate-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const statTones = {
  brand: "text-brand-600 bg-brand-50",
  slate: "text-slate-700 bg-slate-100",
  red: "text-red-600 bg-red-50",
  green: "text-green-600 bg-green-50",
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
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
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
    <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />
  );
}
