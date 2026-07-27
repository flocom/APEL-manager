import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef } from "react";
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
  "w-full rounded-lg border-2 border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 transition-colors duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-600 focus:outline-none focus:ring-0 sm:text-sm";

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
    "inline-flex items-center justify-center gap-2 rounded-lg border-2 font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes: Record<Size, string> = {
    sm: "min-h-9 px-3 py-1.5 text-sm",
    md: "min-h-11 px-4 py-2.5 text-sm",
  };
  const variants: Record<Variant, string> = {
    primary:
      "border-brand-700 bg-brand-700 text-white hover:border-brand-800 hover:bg-brand-800",
    accent:
      "border-coral-600 bg-coral-600 text-white hover:border-coral-700 hover:bg-coral-700",
    secondary:
      "border-brand-950 bg-brand-950 text-white hover:bg-brand-900",
    outline:
      "border-slate-300 bg-white text-slate-700 hover:border-brand-700 hover:bg-brand-50 hover:text-brand-800",
    danger:
      "border-coral-700 bg-coral-700 text-white hover:border-coral-800 hover:bg-coral-800",
    ghost:
      "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
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

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(fieldClasses, className)} {...props} />
  );
});

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
      className={cn(
        "mb-1.5 block text-sm font-semibold text-slate-700",
        className,
      )}
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
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
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
        "rounded-2xl border-2 border-slate-200 bg-white",
        className,
      )}
      {...props}
    />
  );
}

const badgeColors = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200/70",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  amber: "bg-sand-50 text-sand-800 ring-sand-200/80",
  red: "bg-coral-50 text-coral-700 ring-coral-200/80",
  blue: "bg-brand-50 text-brand-700 ring-brand-200/80",
  sea: "bg-sea-50 text-sea-700 ring-sea-200/80",
  coral: "bg-coral-50 text-coral-700 ring-coral-200/80",
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
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-brand-200 bg-brand-50 text-brand-700">
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
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
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-700 text-white">
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
  brand: "border-brand-700 bg-brand-700 text-white",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  red: "border-coral-700 bg-coral-700 text-white",
  green: "border-emerald-700 bg-emerald-700 text-white",
  sand: "border-sand-400 bg-sand-400 text-brand-950",
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
    <Card className="flex items-center gap-4 p-5">
      {Icon && (
        <span
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2",
            statTones[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="text-2xl font-bold leading-none tracking-tight text-slate-950">
          {value}
        </p>
        <p className="mt-1.5 text-sm font-medium text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-slate-200",
        className,
      )}
    />
  );
}
