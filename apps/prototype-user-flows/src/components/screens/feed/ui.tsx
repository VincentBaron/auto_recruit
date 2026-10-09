"use client";

// Small presentational primitives used by every Feed variant. Calm zinc greys, one indigo accent,
// 14px base text, tabular numbers for scores and Credits.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { formatScore } from "@/lib/format";

export { cx };

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonTone = "primary" | "secondary" | "ghost" | "danger" | "dark" | "selected";
type ButtonSize = "xs" | "sm" | "md";

const TONE: Record<ButtonTone, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300",
  secondary: "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:text-zinc-400",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300",
  danger: "border border-zinc-200 bg-white text-rose-700 shadow-xs hover:bg-rose-50 disabled:text-rose-300",
  dark: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400",
  selected: "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-300 hover:bg-indigo-100",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded px-2 text-xs",
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-8 gap-1.5 rounded-md px-3 text-sm",
};

export function buttonClass(tone: ButtonTone = "secondary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed",
    TONE[tone],
    SIZE[size],
  );
}

export function Button({
  tone = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { tone?: ButtonTone; size?: ButtonSize; loading?: boolean }) {
  return (
    <button type="button" className={cx(buttonClass(tone, size), className)} {...rest} disabled={rest.disabled || loading}>
      {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <Link className={cx(buttonClass(tone, size), className)} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "indigo" | "success" | "warning" | "danger" | "outline" | "violet";

const BADGE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  outline: "bg-white text-zinc-600 ring-zinc-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  title,
  className,
  wrap = false,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
  /** Let a long label break onto further lines instead of being cut (narrow table columns). */
  wrap?: boolean;
}) {
  return (
    <span
      title={title}
      className={cx(
        // The same pill as core's LifecycleBadge and RetentionBadge, so they sit side by side.
        "inline-flex max-w-full shrink-0 gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        wrap ? "items-start" : "items-center whitespace-nowrap",
        BADGE[tone],
        className,
      )}
    >
      {icon}
      <span className={wrap ? "break-words" : "truncate"}>{children}</span>
    </span>
  );
}

export function NewSignalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="A new Signal arrived since you last looked"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-1.5 py-px text-[10px] leading-4 font-semibold tracking-wide text-white uppercase"
    >
      <span className="size-1.5 rounded-full bg-white" aria-hidden />
      {compact ? "New" : "New Signal"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Scores                                                              */
/* ------------------------------------------------------------------ */

/** Signal Strength as a number and a thin bar: the same look as core's FitMeter, without a threshold. */
export function SignalStrengthMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-2" title={`Signal Strength ${v} out of 100`} aria-label={`Signal Strength ${v} out of 100`} role="img">
      <span className="w-6 text-right text-sm text-zinc-900 tabular-nums">{formatScore(v)}</span>
      <span className="relative h-1.5 w-14 rounded-full bg-zinc-100" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Kbd({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 font-sans text-[10px] font-semibold",
        dark ? "bg-white/15 text-white ring-1 ring-white/20" : "bg-white text-zinc-600 shadow-xs ring-1 ring-zinc-300",
      )}
    >
      {children}
    </kbd>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  label,
  title,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={title ?? label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{children}</h3>
      {aside}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">{icon}</div>
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-zinc-500">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
