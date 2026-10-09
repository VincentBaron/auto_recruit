"use client";

// Small UI primitives for the campaigns screens: calm, dense, zinc greys with one indigo accent.
// The page frame (PageContainer, PageHeader), stat tiles, the price hint and `cx` come from the
// shared core components so every screen looks the same.

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cx } from "@/components/ui/cx";

export { cx };
export { PriceHint } from "@/components/ui/price-hint";
export { PageContainer, PageHeader } from "@/components/shell/page";
export { StatGrid, StatTile } from "@/components/ui/stat-tile";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
  secondary: "border border-zinc-300 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-500",
  "danger-ghost": "text-red-600 hover:bg-red-50",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-xs",
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

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
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "indigo" | "green" | "amber" | "red" | "blue" | "violet" | "sky";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  indigo: "bg-indigo-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
};

export function dotClass(tone: Tone): string {
  return DOT_TONES[tone];
}

export function Badge({ tone = "neutral", icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", DOT_TONES[tone])} />;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("min-w-0 rounded-lg border border-zinc-200 bg-white", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-3", className)}>
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-zinc-200/70", className)} />;
}

export function EmptyState({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 [&>svg]:size-5">{icon}</div>
      <h3 className="mt-3 text-sm font-semibold text-zinc-900">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-sm leading-6 text-zinc-500">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

const CALLOUT_TONES = {
  info: { box: "border-zinc-200 bg-zinc-50 text-zinc-700", icon: <Info className="size-4 text-zinc-500" aria-hidden /> },
  indigo: { box: "border-indigo-200 bg-indigo-50/60 text-indigo-900", icon: <Info className="size-4 text-indigo-500" aria-hidden /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: <TriangleAlert className="size-4 text-amber-600" aria-hidden /> },
  danger: { box: "border-red-200 bg-red-50 text-red-800", icon: <CircleAlert className="size-4 text-red-600" aria-hidden /> },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: <CircleCheck className="size-4 text-emerald-600" aria-hidden /> },
} as const;

export type CalloutTone = keyof typeof CALLOUT_TONES;

/**
 * A tinted note. `action` sits beside the text from `sm` up and under it on phones, so the text
 * keeps its width; `onDismiss` adds a close button that always stays top right.
 */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
  icon,
  role,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  icon?: ReactNode;
  role?: "status" | "alert";
}) {
  const t = CALLOUT_TONES[tone];
  return (
    <div role={role} className={cx("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", t.box, className)}>
      <div className="mt-0.5 shrink-0">{icon ?? t.icon}</div>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          {title ? <div className="font-medium">{title}</div> : null}
          {children ? <div className={cx("leading-6", title ? "mt-0.5 text-[13px] opacity-90" : "")}>{children}</div> : null}
        </div>
        {action ? <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 sm:mt-0">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="-mr-1 shrink-0 self-start rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, error, children, htmlFor, optional }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-sm font-medium text-zinc-800">
        {label}
        {optional ? <span className="text-xs font-normal text-zinc-400">Optional</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-xs leading-5 text-zinc-500">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

// No width here: `cx` joins classes without merging them, so a base `w-full` would beat a call
// site's `w-28`. Every call site states its width (`w-full`, `w-28`...).
const INPUT_CLASS =
  "block min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-zinc-50 disabled:text-zinc-500";

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(INPUT_CLASS, "h-8", className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(INPUT_CLASS, "py-2 leading-6", className)} {...rest} />;
}

export function Checkbox({ checked, onChange, disabled, label, className, indeterminate }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label?: string; className?: string; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className={cx("size-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40", className)}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50",
        checked ? "bg-indigo-600" : "bg-zinc-300",
      )}
    >
      <span className={cx("inline-block size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: "sm" | "md"; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-md border border-zinc-200 bg-zinc-100/80 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              active ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className={cx("tabular-nums", active ? "text-zinc-500" : "text-zinc-400")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
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
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx("relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl ring-1 ring-zinc-200 sm:rounded-xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/70 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/25" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col bg-zinc-50 shadow-2xl ring-1 ring-zinc-200">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastTone = "success" | "danger" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const ToastContext = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export function useToast(): (t: Omit<ToastItem, "id">) => void {
  return useContext(ToastContext);
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(item.id), item.tone === "danger" ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [item.id, item.tone, onDone]);
  const icon =
    item.tone === "success" ? (
      <CircleCheck className="size-4 text-emerald-600" aria-hidden />
    ) : item.tone === "danger" ? (
      <CircleAlert className="size-4 text-red-600" aria-hidden />
    ) : (
      <Info className="size-4 text-indigo-500" aria-hidden />
    );
  return (
    <div role="status" className="pointer-events-auto flex w-full gap-2.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-3 shadow-lg">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-900">{item.title}</div>
        {item.description ? <div className="mt-0.5 text-[13px] leading-5 text-zinc-600">{item.description}</div> : null}
      </div>
      <button type="button" onClick={() => onDone(item.id)} className="-mr-1 -mt-0.5 self-start rounded p-0.5 text-zinc-400 hover:text-zinc-700" aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
  }, []);
  const done = useCallback((id: number) => setItems((prev) => prev.filter((x) => x.id !== id)), []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-[5.25rem] z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={done} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Avatar({ name, initials, size = "sm" }: { name: string; initials: string; size?: "xs" | "sm" }) {
  return (
    <span
      title={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700",
        size === "xs" ? "size-5 text-[9px]" : "size-6 text-[10px]",
      )}
    >
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-zinc-300 bg-white px-1 font-sans text-[11px] text-zinc-500">{children}</kbd>;
}

/** Definition list row used in summaries. */
export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[120px_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-zinc-900">{children}</dd>
    </div>
  );
}
