"use client";

// Local UI primitives for the setup screens (landing, sign-up, Niche setup, Niches).
// Neutral zinc greys, one indigo accent, 14px base text, tabular numbers for scores and Credits.
// The page frame (PageContainer, PageHeader), stat tiles, price hints and selects come from core:
// @/components/shell/page and @/components/ui/*.

import Link from "next/link";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, CircleAlert, Info, LoaderCircle, Lock, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { initials } from "@/lib/format";
import { cx } from "@/components/ui/cx";

export { cx };

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
  secondary: "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:border-zinc-300 hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "border border-red-200 bg-white text-red-600 shadow-xs hover:border-red-300 hover:bg-red-50",
  dark: "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-8 px-3 text-sm [&_svg]:size-4",
  lg: "h-10 px-4 text-sm [&_svg]:size-4",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, avatars                                                     */
/* ------------------------------------------------------------------ */

export type Tone = "zinc" | "indigo" | "emerald" | "amber" | "red" | "sky";

const BADGE_TONES: Record<Tone, string> = {
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

const DOT_TONES: Record<Tone, string> = {
  zinc: "bg-zinc-400",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  sky: "bg-sky-500",
};

export function Badge({ tone = "zinc", dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className={cx("size-1.5 rounded-full", DOT_TONES[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" | "md" }) {
  const sizes = { xs: "size-5 text-[10px]", sm: "size-6 text-[11px]", md: "size-8 text-xs" };
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-700", sizes[size])}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-sans text-[11px] font-medium text-zinc-500">{children}</kbd>;
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-xl border border-zinc-200 bg-white shadow-xs", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-zinc-400 [&_svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

export function Divider() {
  return <div className="h-px bg-zinc-100" />;
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-100", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-4 animate-spin text-zinc-400", className)} aria-hidden />;
}

export type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function Callout({
  tone = "info",
  title,
  children,
  actions,
  icon,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const defaultIcon =
    tone === "danger" ? <CircleAlert /> : tone === "warning" ? <TriangleAlert /> : tone === "success" ? <Check /> : <Info />;
  return (
    <div className={cx("flex flex-col gap-3 rounded-lg border px-3.5 py-3 text-sm sm:flex-row sm:items-center", CALLOUT_TONES[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-0.5 shrink-0 opacity-80 [&_svg]:size-4">{icon ?? defaultIcon}</span>
        <div className="min-w-0">
          {title ? <div className="font-medium">{title}</div> : null}
          {children ? <div className={cx(title ? "mt-0.5 opacity-90" : "", "text-[13px] leading-relaxed")}>{children}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 sm:pl-0">{actions}</div> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-red-600" role="alert">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center", className)}>
      {icon ? (
        <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 [&_svg]:size-5">{icon}</span>
      ) : null}
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-zinc-500">{description}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

/** Input look without height, width or text size, for inputs that set their own. */
export const inputBaseClass =
  "rounded-md border border-zinc-300 bg-white px-2.5 text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-zinc-50 disabled:text-zinc-500";

export const inputClass = `${inputBaseClass} h-8 w-full text-sm`;

export const textareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm leading-relaxed text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  aside,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-xs font-medium text-zinc-700">
            {label}
          </label>
        ) : (
          <span className="text-xs font-medium text-zinc-700">{label}</span>
        )}
        {aside ? <span className="text-xs text-zinc-400">{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/** A chip shown before the editable ones that cannot be removed (lock icon, reason as tooltip). */
export interface LockedChip {
  value: string;
  reason: string;
}

/** Free-text chips with type-ahead options and optional agent suggestions. */
export function ChipInput({
  values,
  onChange,
  options = [],
  suggested = [],
  locked = [],
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options?: string[];
  suggested?: string[];
  locked?: LockedChip[];
  placeholder?: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState("");
  const query = text.trim().toLowerCase();
  const has = (v: string) => [...locked.map((l) => l.value), ...values].some((x) => x.toLowerCase() === v.toLowerCase());
  const matches = query ? options.filter((o) => o.toLowerCase().includes(query) && !has(o)).slice(0, 6) : [];
  const pendingSuggestions = suggested.filter((s) => !has(s));

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    setText("");
    if (!v || has(v)) return;
    onChange([...values, v]);
  };

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-1.5 py-1 shadow-xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
        {locked.map((l) => (
          <span
            key={l.value}
            title={l.reason}
            className="inline-flex max-w-full cursor-default items-center gap-1 rounded bg-zinc-100 py-0.5 pl-1.5 pr-2 text-xs font-medium text-zinc-800 ring-1 ring-inset ring-zinc-200"
          >
            <Lock className="size-3 shrink-0 text-zinc-400" aria-hidden />
            <span className="truncate">{l.value}</span>
            <span className="sr-only">({l.reason})</span>
          </span>
        ))}
        {values.map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-0.5 rounded bg-zinc-100 py-0.5 pl-2 pr-0.5 text-xs font-medium text-zinc-800">
            <span className="truncate">{v}</span>
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={text}
          aria-label={ariaLabel}
          placeholder={values.length === 0 && locked.length === 0 ? placeholder : "Add..."}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const first = matches[0];
              add(first && first.toLowerCase().startsWith(query) ? first : text);
            } else if (e.key === "Backspace" && text === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (text.trim()) add(text);
          }}
          className="h-6 min-w-[7rem] flex-1 bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
      </div>
      {matches.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(m)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:border-indigo-300 hover:text-indigo-700"
            >
              <Plus className="size-3" aria-hidden />
              {m}
            </button>
          ))}
        </div>
      ) : null}
      {pendingSuggestions.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-indigo-600">
            <Sparkles className="size-3" aria-hidden />
            Suggested
          </span>
          {pendingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 px-2 text-xs text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="size-3" aria-hidden />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Multi-select from a fixed list of options, kept in the options' order. */
export function ToggleChips({
  options,
  values,
  onChange,
  ariaLabel,
  suggested = [],
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  suggested?: string[];
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = values.includes(o);
        const hinted = !on && suggested.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((v) => v !== o) : options.filter((x) => x === o || values.includes(x)))}
            className={cx(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
              on
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : hinted
                  ? "border-dashed border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50/50"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
            )}
          >
            {on ? <Check className="size-3" aria-hidden /> : hinted ? <Sparkles className="size-3" aria-hidden /> : null}
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50",
        checked ? "bg-indigo-600" : "bg-zinc-300",
      )}
    >
      <span className={cx("inline-block size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("relative max-h-[calc(100vh-24px)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl", className)}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-zinc-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children ? <div className="px-5 py-3 text-sm text-zinc-700">{children}</div> : null}
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  );
}

/** A label / value row inside cost summaries and detail lists. */
export function KeyValue({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={cx("text-right tabular-nums", strong ? "font-semibold text-zinc-900" : "text-zinc-800")}>{value}</dd>
    </div>
  );
}
