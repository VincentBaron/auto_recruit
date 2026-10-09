"use client";

// Small presentational building blocks shared by the Test Run and Credits screens. The page frame
// (PageContainer, PageHeader), stat tiles, price hint, selects and person badges come from core.
// Calm zinc neutrals, one indigo accent, 14px base text, tabular numbers for scores and Credits.

import Link from "next/link";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";

export { cx };

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 items-center gap-1 text-xs text-zinc-500">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className={cx("flex items-center gap-1", i === 0 || i === items.length - 1 ? "shrink-0" : "min-w-0")}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-zinc-400" aria-hidden />}
          {item.href ? (
            <Link href={item.href} className="truncate hover:text-zinc-900">
              {item.label}
            </Link>
          ) : (
            <span className="truncate text-zinc-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="mb-3 flex scroll-mt-6 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-zinc-200 bg-white shadow-xs", className)}>{children}</div>;
}

export function CardHeader({ title, description, actions, icon: Icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 disabled:bg-indigo-300",
  secondary: "border border-zinc-300 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:text-zinc-400 disabled:hover:bg-white",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300 disabled:hover:bg-transparent",
  danger: "border border-rose-200 bg-white text-rose-700 shadow-xs hover:bg-rose-50 disabled:text-rose-300",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-8 gap-2 rounded-md px-3 text-sm",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  return cx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; loading?: boolean }) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <LoaderCircle className={cx(iconSize, "animate-spin")} aria-hidden /> : Icon ? <Icon className={iconSize} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon: Icon,
  trailingIcon: Trailing,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {Icon && <Icon className={iconSize} aria-hidden />}
      {children}
      {Trailing && <Trailing className={iconSize} aria-hidden />}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Badges and callouts                                                 */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "indigo" | "green" | "amber" | "red" | "sky";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({ tone = "neutral", icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", BADGE_TONES[tone], className)}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

const CALLOUT_TONES: Record<"indigo" | "amber" | "red" | "green" | "neutral", { box: string; icon: string; title: string }> = {
  indigo: { box: "border-indigo-200 bg-indigo-50/70", icon: "text-indigo-600", title: "text-indigo-950" },
  amber: { box: "border-amber-200 bg-amber-50/70", icon: "text-amber-600", title: "text-amber-950" },
  red: { box: "border-rose-200 bg-rose-50/70", icon: "text-rose-600", title: "text-rose-950" },
  green: { box: "border-emerald-200 bg-emerald-50/70", icon: "text-emerald-600", title: "text-emerald-950" },
  neutral: { box: "border-zinc-200 bg-zinc-50", icon: "text-zinc-500", title: "text-zinc-900" },
};

export function Callout({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = CALLOUT_TONES[tone];
  return (
    <div className={cx("flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between", t.box, className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <Icon className={cx("mt-0.5 size-4 shrink-0", t.icon)} aria-hidden />}
        <div className="min-w-0 text-sm">
          {title && <p className={cx("font-medium", t.title)}>{title}</p>}
          {children && <div className={cx("text-zinc-600", title ? "mt-0.5" : "")}>{children}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-4">{actions}</div>}
    </div>
  );
}

export function ErrorText({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      <span className="min-w-0">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 text-rose-500 hover:bg-rose-100" aria-label="Dismiss">
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value, className, tone = "indigo" }: { value: number; className?: string; tone?: "indigo" | "green" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", tone === "green" ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Signal Strength as a number and a thin bar: the same look as core's FitMeter, without a threshold. */
export function SignalStrengthMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-2" title={`Signal Strength ${v} out of 100`} aria-label={`Signal Strength ${v} out of 100`} role="img">
      <span className="w-6 text-right text-sm text-zinc-900 tabular-nums">{v}</span>
      <span className="relative h-1.5 w-14 rounded-full bg-zinc-100" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-200/70", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, children, actions }: { icon: LucideIcon; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-zinc-100">
        <Icon className="size-5 text-zinc-500" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-zinc-500">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-indigo-600" : "bg-zinc-300",
      )}
    >
      <span className={cx("inline-block size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              active ? "bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cx("tabular-nums", active ? "text-zinc-500" : "text-zinc-400")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const titleId = useId();
  // Rendered into document.body (after mount) so no transformed or contained ancestor clips it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl",
          size === "lg" ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description && <div className="mt-0.5 text-sm text-zinc-500">{description}</div>}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A label/value row for cost summaries (tabular, right-aligned values). */
export function SummaryRow({ label, value, strong = false, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong ? "font-semibold text-zinc-900" : "text-zinc-600")}>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {label}
        {hint}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
