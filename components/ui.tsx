import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export const inputCls =
  "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const variants = {
  primary: "bg-primary text-primary-foreground",
  secondary: "border border-border bg-card",
  danger: "border border-danger/50 bg-card text-danger",
} as const;

export function Btn({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button type="button" {...props}
      className={cn("h-12 w-full rounded-xl px-4 text-base font-semibold transition-opacity active:opacity-80 disabled:opacity-50", variants[variant], className)} />
  );
}

const badge: Record<string, string> = {
  received: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  with_tailor: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  ready: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  delivered: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", badge[status])}>{STATUS_LABEL[status]}</span>;
}
