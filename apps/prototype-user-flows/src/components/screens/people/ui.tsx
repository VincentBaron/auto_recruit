"use client";

// Local UI primitives for the people screens (/prospects/[id], /candidates/[id]). The page frame,
// stat tiles, person badges and price hint come from the shared core components.
// Zinc greys, one indigo accent, 14px base text, tabular numbers for scores and Credits.

import Link from "next/link";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { StatTile } from "@/components/ui/stat-tile";
import { cx } from "@/components/ui/cx";
import { initials } from "@/lib/format";

export { cx };

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "indigo" | "green" | "amber" | "red" | "sky" | "violet";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  title,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3 [&_svg]:shrink-0",
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0";
const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 disabled:hover:bg-indigo-600",
  secondary: "bg-white text-zinc-800 shadow-xs ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:hover:bg-white",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:hover:bg-transparent",
  danger: "bg-white text-rose-700 shadow-xs ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:hover:bg-white",
};
const BUTTON_SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-8 px-3 text-sm [&_svg]:size-4",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

/** In-page anchors land below the sticky chrome (PROTOTYPE banner and top bar). */
export const ANCHOR_OFFSET = "scroll-mt-[calc(var(--chrome-h)+1rem)]";

export function Card({
  id,
  title,
  description,
  icon,
  actions,
  children,
  flush = false,
  className,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cx(ANCHOR_OFFSET, "rounded-xl border border-zinc-200 bg-white shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-2 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 [&_svg]:size-4 [&_svg]:text-zinc-400">
              {icon}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "px-4 py-3"}>{children}</div>
    </section>
  );
}

/**
 * The shared stat tile with an in-page anchor at the top right ("Explain", "View") and an optional
 * bar under the number.
 */
export function ScoreTile({
  label,
  value,
  sub,
  link,
  bar,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** In-page anchor (e.g. "#breakdown"). */
  link?: { href: string; label: string };
  bar?: ReactNode;
}) {
  return (
    <StatTile
      label={
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          {link ? (
            <a href={link.href} className="shrink-0 text-indigo-600 hover:text-indigo-500">
              {link.label}
            </a>
          ) : null}
        </span>
      }
      value={
        <span className="block truncate" title={typeof value === "string" ? value : undefined}>
          {value}
        </span>
      }
      hint={
        bar || sub ? (
          <>
            {bar ? <div className="mt-2 mb-2">{bar}</div> : null}
            {sub ? <div>{sub}</div> : null}
          </>
        ) : undefined
      }
    />
  );
}

/**
 * Full-width 0-100 bar. With a `threshold` it reads like the shared FitMeter: indigo at or above the
 * Fit threshold, grey below, and a tick at the threshold.
 */
export function Meter({ value, threshold }: { value: number; threshold?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const below = threshold !== undefined && clamped < threshold;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-zinc-100">
      <div className={cx("h-full rounded-full", below ? "bg-zinc-400" : "bg-indigo-500")} style={{ width: `${clamped}%` }} />
      {threshold !== undefined && (
        <div
          className="absolute -top-0.5 h-2.5 w-px bg-zinc-500"
          style={{ left: `${Math.max(0, Math.min(100, threshold))}%` }}
          title={`Fit threshold ${threshold}`}
        />
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-100", className)} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center text-center", compact ? "py-5" : "py-8")}>
      <div className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 [&_svg]:size-4">{icon}</div>
      <p className="mt-2.5 text-[13px] font-medium text-zinc-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
}: {
  tone?: "neutral" | "amber" | "red" | "green" | "indigo";
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700 [&_.callout-icon]:text-zinc-500",
    amber: "border-amber-200 bg-amber-50 text-amber-900 [&_.callout-icon]:text-amber-600",
    red: "border-rose-200 bg-rose-50 text-rose-900 [&_.callout-icon]:text-rose-600",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 [&_.callout-icon]:text-emerald-600",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900 [&_.callout-icon]:text-indigo-600",
  } as const;
  return (
    <div className={cx("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", tones[tone])}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="callout-icon mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{title}</p>
          {children && <div className="mt-0.5 text-xs leading-5 opacity-90">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className={cx("flex min-w-0 items-center gap-1.5", i === items.length - 1 && "truncate")}>
            {i > 0 && <span className="text-zinc-300">/</span>}
            {item.href ? (
              <Link href={item.href} className="whitespace-nowrap hover:text-zinc-800">
                {item.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-zinc-700">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Two-column definition row used in fact cards. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-zinc-900">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small inline bits                                                   */
/* ------------------------------------------------------------------ */

/** "https://www.fintory.example/careers/123" -> "fintory.example/careers/123". */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cx("inline-flex min-w-0 items-center gap-1 text-indigo-600 hover:text-indigo-500 hover:underline", className)}
    >
      <span className="truncate">{children}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function Avatar({ name, shape = "circle", size = "md" }: { name: string; shape?: "circle" | "square"; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm" } as const;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold",
        shape === "circle" ? "rounded-full bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200" : "rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
        sizes[size],
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Facts separated by dots that wrap cleanly: every fact carries its dot before it, and the list is
 * shifted left by one dot inside a clipping box, so the dot that starts a line is never visible.
 */
export function MetaList({ items, className, spacing = "md" }: { items: ReactNode[]; className?: string; spacing?: "sm" | "md" }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  return (
    <div className={cx("-ml-1 overflow-hidden pl-1", className)}>
      <p className={cx("flex min-w-0 flex-wrap items-center gap-y-0.5", spacing === "sm" ? "-ml-4" : "-ml-5")}>
        {shown.map((item, i) => (
          <span
            key={i}
            className={cx(
              "inline-flex min-w-0 items-center before:inline-block before:shrink-0 before:text-center before:text-zinc-300 before:content-['·']",
              spacing === "sm" ? "before:w-4" : "before:w-5",
            )}
          >
            {item}
          </span>
        ))}
      </p>
    </div>
  );
}

export function Dot() {
  return (
    <span aria-hidden="true" className="text-zinc-300">
      ·
    </span>
  );
}

/** Two-way segmented tabs. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-zinc-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular-nums text-zinc-400">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  footerNote,
  width = "sm:max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** The buttons, right-aligned (stacked full width on phones). */
  footer?: ReactNode;
  /** A cost or balance line shown left of the buttons. */
  footerNote?: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // Focus moves into the dialog on open and back to where it was on close; Escape closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 ring-zinc-200 outline-none sm:rounded-xl", width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-zinc-500">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {(footer || footerNote) && (
          <div
            className={cx(
              "flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3 sm:flex-row sm:items-center",
              footerNote ? "sm:justify-between" : "sm:justify-end",
            )}
          >
            {footerNote && <div className="min-w-0 flex-1 text-xs text-zinc-600">{footerNote}</div>}
            {footer && <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">{footer}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-zinc-900 shadow-xs ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";
