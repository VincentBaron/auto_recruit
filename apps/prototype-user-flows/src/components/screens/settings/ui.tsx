"use client";

// Small UI kit for the Settings screens: zinc neutrals, one indigo accent, 14px base text.
// The page frame, stat tiles, selects and the signed-out state come from the shared kit
// (src/components/shell, src/components/ui) so Settings lines up with every other page.

import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, CircleAlert, CircleCheck, Copy, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { cx } from "@/components/ui/cx";
import { Select as BaseSelect } from "@/components/ui/select";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { initials } from "@/lib/format";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export { cx, StatGrid, StatTile };

/* ------------------------------------------------------------------ */
/* Page layout                                                         */
/* ------------------------------------------------------------------ */

export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageContainer>
      <PageHeader eyebrow="Settings" title={title} description={description} actions={actions} />
      <div className="flex flex-col gap-6">{children}</div>
    </PageContainer>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-zinc-200 bg-white shadow-xs", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-zinc-900">{title}</h2> : null}
            {description ? <div className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children !== undefined ? <div className={cx("min-w-0", bodyClassName ?? "px-4 py-4 sm:px-5")}>{children}</div> : null}
    </section>
  );
}

export function SectionTitle({ children, count, actions }: { children: ReactNode; count?: number; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        {children}
        {count !== undefined ? (
          <span className="rounded-full bg-zinc-100 px-1.5 py-px text-xs font-medium tabular-nums text-zinc-600">{count}</span>
        ) : null}
      </h2>
      {actions}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type ButtonSize = "sm" | "md";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-1",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
    variant === "primary" && "bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 disabled:hover:bg-indigo-600",
    variant === "secondary" && "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:hover:bg-white",
    variant === "ghost" && "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:hover:bg-transparent",
    variant === "danger" && "bg-red-600 text-white shadow-xs hover:bg-red-500 disabled:hover:bg-red-600",
    variant === "danger-ghost" && "text-red-600 hover:bg-red-50 disabled:hover:bg-transparent",
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconType;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const iconClass = size === "sm" ? "size-3.5" : "size-4";
  return (
    <button type={type} className={cx(buttonClass(variant, size), className)} disabled={loading || disabled} {...rest}>
      {loading ? <LoaderCircle className={cx(iconClass, "animate-spin")} aria-hidden /> : Icon ? <Icon className={iconClass} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function CopyButton({ value, label = "Copy", size = "sm", dark = false }: { value: string; label?: string; size?: ButtonSize; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      size={size}
      variant={dark ? "ghost" : "secondary"}
      className={dark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : undefined}
      icon={copied ? Check : Copy}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, avatars, meters                                             */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "indigo" | "green" | "amber" | "red" | "sky";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({ tone = "neutral", icon: Icon, children, className }: { tone?: Tone; icon?: IconType; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  indigo: "bg-indigo-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  sky: "bg-sky-500",
};

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cx("inline-block size-1.5 shrink-0 rounded-full", DOT_TONES[tone])} aria-hidden />;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const METER_TONES: Record<"indigo" | "amber" | "red" | "green" | "neutral", { track: string; fill: string }> = {
  indigo: { track: "bg-indigo-100", fill: "bg-indigo-500" },
  amber: { track: "bg-amber-100", fill: "bg-amber-500" },
  red: { track: "bg-red-100", fill: "bg-red-500" },
  green: { track: "bg-emerald-100", fill: "bg-emerald-500" },
  neutral: { track: "bg-zinc-100", fill: "bg-zinc-400" },
};

/** A single ratio against a limit. The track is a lighter step of the fill's hue. */
export function Meter({ value, max, tone = "indigo", label }: { value: number; max: number; tone?: keyof typeof METER_TONES; label: string }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const t = METER_TONES[tone];
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full", t.track)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={cx("h-full rounded-full", t.fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A labelled pass/fail check (SPF, DKIM, ...). Status is icon + label, never color alone. */
export function CheckItem({ ok, label, warn = false }: { ok: boolean; label: string; warn?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs", ok ? "text-zinc-700" : warn ? "text-amber-700" : "text-red-700")}>
      {ok ? (
        <CircleCheck className="size-3.5 text-emerald-600" aria-hidden />
      ) : warn ? (
        <TriangleAlert className="size-3.5 text-amber-600" aria-hidden />
      ) : (
        <CircleAlert className="size-3.5 text-red-600" aria-hidden />
      )}
      {label}
    </span>
  );
}

/**
 * A human-readable email address. On a narrow screen it wraps after the "@" first, and splits a
 * part mid-word only when that part alone is still wider than the line.
 */
export function EmailAddress({ address, className }: { address: string; className?: string }) {
  const at = address.lastIndexOf("@");
  return (
    <span className={cx("[overflow-wrap:anywhere]", className)}>
      {at > 0 ? (
        <>
          {address.slice(0, at + 1)}
          <wbr />
          {address.slice(at + 1)}
        </>
      ) : (
        address
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Callouts, empty states, flashes, skeletons                          */
/* ------------------------------------------------------------------ */

const CALLOUT_TONES = {
  info: { box: "border-zinc-200 bg-zinc-50 text-zinc-700", icon: Info, iconClass: "text-zinc-500" },
  indigo: { box: "border-indigo-200 bg-indigo-50/60 text-indigo-900", icon: Info, iconClass: "text-indigo-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: TriangleAlert, iconClass: "text-amber-600" },
  danger: { box: "border-red-200 bg-red-50 text-red-900", icon: CircleAlert, iconClass: "text-red-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CircleCheck, iconClass: "text-emerald-600" },
} as const;

export type CalloutTone = keyof typeof CALLOUT_TONES;

export function Callout({
  tone = "info",
  title,
  children,
  icon,
  actions,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconType;
  actions?: ReactNode;
  className?: string;
}) {
  const t = CALLOUT_TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <div className={cx("flex gap-3 rounded-lg border px-3.5 py-3 text-sm", t.box, className)}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", t.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cx("leading-6", title ? "mt-0.5 opacity-90" : "")}>{children}</div> : null}
        {actions ? <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: IconType; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100">
        <Icon className="size-5 text-zinc-500" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-900">{title}</p>
      {description ? <div className="mt-1 max-w-sm text-sm leading-6 text-zinc-500">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export interface FlashMessage {
  tone: "success" | "danger" | "info";
  text: string;
  detail?: string[];
}

/** One transient message per screen, shown under the header after an action. */
export function useFlash(): [FlashMessage | null, (m: FlashMessage | null) => void] {
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  useEffect(() => {
    if (!flash || flash.tone === "danger") return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);
  return [flash, setFlash];
}

export function Flash({ flash, onClose }: { flash: FlashMessage | null; onClose: () => void }) {
  if (!flash) return null;
  const tone: CalloutTone = flash.tone === "info" ? "indigo" : flash.tone;
  return (
    <div role="status" className="-mt-2">
      <Callout
        tone={tone}
        title={
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 [overflow-wrap:anywhere]">{flash.text}</span>
            <button type="button" onClick={onClose} className="-m-1 rounded p-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        }
      >
        {flash.detail && flash.detail.length > 0 ? (
          <ul className="list-disc pl-4 text-xs leading-5">
            {flash.detail.slice(0, 5).map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : null}
      </Callout>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-100", className)} />;
}

/**
 * Loading state of a Settings screen: same markup on the server and on the first client render
 * (state is null until mounted). When the dummy backend fails instead, the shared error state with Try again.
 */
export function SettingsSkeleton({ title, description, rows = 3, error = null }: { title: string; description: ReactNode; rows?: number; error?: string | null }) {
  if (error) return <BackendErrorState error={error} />;
  return (
    <SettingsPage title={title} description={description}>
      <StatGrid>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-200">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-7 w-14" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </StatGrid>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs">
        <div className="border-b border-zinc-100 px-5 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-zinc-100">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

const CONTROL =
  "block min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-zinc-50 disabled:text-zinc-500";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-700">
        {label}
      </label>
      <div className="mt-1.5">{children(id)}</div>
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/** Full width unless the caller sets its own width (two width utilities would fight over the cascade). */
function widthClass(className: string | undefined): string | null {
  return /(^|\s)w-/.test(className ?? "") ? null : "w-full";
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, widthClass(className), "h-8", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, widthClass(className), "py-2 leading-6", className)} {...rest} />;
}

/** The shared select (drawn chevron, same look on every page), full width unless the caller sets a width. */
export function Select({ className, ...rest }: ComponentProps<typeof BaseSelect>) {
  return <BaseSelect className={cx(widthClass(className), className)} {...rest} />;
}

export function Checkbox({
  checked,
  onChange,
  children,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-indigo-600"
      />
      <label htmlFor={id} className="min-w-0 text-sm text-zinc-800">
        <span className="font-medium">{children}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{description}</span> : null}
      </label>
    </div>
  );
}

/** Large selectable option (provider choice, lookalike domain...). */
export function OptionCard({
  selected,
  onSelect,
  title,
  description,
  icon: Icon,
  aside,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconType;
  aside?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "flex w-full min-w-0 items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        selected ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
        disabled && "cursor-not-allowed opacity-50 hover:border-zinc-200 hover:bg-white",
      )}
    >
      {Icon ? (
        <span className={cx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", selected ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-600")}>
          <Icon className="size-4" aria-hidden />
        </span>
      ) : (
        <span
          className={cx(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-indigo-600 bg-indigo-600" : "border-zinc-300 bg-white",
          )}
          aria-hidden
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-zinc-900">{title}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{description}</span> : null}
      </span>
      {aside ? <span className="shrink-0 text-right text-xs text-zinc-500">{aside}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

/** Width of the fade on a tab strip edge that hides more tabs. */
const FADE_PX = 24;

/**
 * A tab strip. When the tabs are wider than the screen (phones), it scrolls sideways: the edge that
 * hides more tabs fades out, and the selected tab is kept in view. The fade is measured after mount,
 * so the server and the first client render match.
 */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: ReactNode; count?: number; badge?: ReactNode }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft < max - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    const active = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    // Scroll the strip only (never the page), with room for the fade.
    const left = active.offsetLeft - FADE_PX;
    const right = active.offsetLeft + active.offsetWidth + FADE_PX - el.clientWidth;
    if (left < el.scrollLeft) el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    else if (right > el.scrollLeft) el.scrollTo({ left: right, behavior: "smooth" });
  }, [value]);

  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? `transparent, #000 ${FADE_PX}px` : "#000"}, ${edges.end ? `#000 calc(100% - ${FADE_PX}px), transparent` : "#000"})`
      : undefined;

  return (
    <div
      ref={scrollerRef}
      className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-zinc-200">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cx(
                "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors",
                active ? "border-indigo-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              {t.label}
              {t.count !== undefined ? (
                <span className={cx("rounded-full px-1.5 py-px text-xs tabular-nums", active ? "bg-indigo-50 text-indigo-700" : "bg-zinc-100 text-zinc-600")}>{t.count}</span>
              ) : null}
              {t.badge}
            </button>
          );
        })}
      </div>
    </div>
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
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass inline handlers and the screen re-renders on every 2-second poll: keep the latest
  // handler in a ref so the open effect (focus, Escape, scroll lock) runs once per opening.
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    closeRef.current = () => {
      if (dismissible) onClose();
    };
  });
  const close = useCallback(() => closeRef.current(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=checkbox]), textarea, select");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl ring-1 ring-zinc-950/5 sm:rounded-xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-xl",
          size === "lg" && "sm:max-w-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description ? <div className="mt-0.5 text-sm leading-6 text-zinc-500 [overflow-wrap:anywhere]">{description}</div> : null}
          </div>
          {dismissible ? (
            <button type="button" onClick={onClose} className="-m-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Step indicator for multi-step dialogs. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cx(
              "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
              i < current && "bg-indigo-600 text-white",
              i === current && "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600",
              i > current && "bg-zinc-100 text-zinc-500",
            )}
          >
            {i < current ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          <span className={cx(i === current ? "font-medium text-zinc-900" : "text-zinc-500")}>{s}</span>
          {i < steps.length - 1 ? <span className="h-px w-4 bg-zinc-200" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Fake OAuth consent screen, clearly separate from sign-in (ADR-0014). */
export function ConsentScreen({
  provider,
  heading,
  scopes,
  note,
}: {
  provider: "google" | "microsoft";
  heading: ReactNode;
  scopes: { scope: string; description: string }[];
  note?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-600">
        <ProviderMark provider={provider} />
        <span className="font-medium">{provider === "google" ? "Google" : "Microsoft"} - permission request</span>
        <span className="ml-auto rounded bg-zinc-200/70 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-zinc-600">Simulated</span>
      </div>
      <div className="px-4 py-4">
        <p className="text-sm font-medium text-zinc-900">{heading}</p>
        <ul className="mt-3 space-y-2.5">
          {scopes.map((s) => (
            <li key={s.scope} className="flex gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden />
              <span className="min-w-0">
                <span className="text-zinc-800">{s.description}</span>
                <code className="mt-0.5 block break-all font-mono text-[11px] text-zinc-500">{s.scope}</code>
              </span>
            </li>
          ))}
        </ul>
        {note ? <div className="mt-4 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500">{note}</div> : null}
      </div>
    </div>
  );
}

export function ProviderMark({ provider }: { provider: "google" | "microsoft" }) {
  if (provider === "google") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-white text-[11px] font-bold text-blue-600 ring-1 ring-zinc-200" aria-hidden>
        G
      </span>
    );
  }
  return (
    <span className="grid size-4 shrink-0 grid-cols-2 gap-px" aria-hidden>
      <span className="bg-orange-500" />
      <span className="bg-lime-500" />
      <span className="bg-sky-500" />
      <span className="bg-amber-400" />
    </span>
  );
}

export const PROVIDER_PRODUCT: Record<"google" | "microsoft", string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

/** Shown under the page's normal header when no Workspace exists yet (New user scenario). */
export function NoWorkspace({ title, description, what }: { title: string; description: ReactNode; what: string }) {
  return (
    <SettingsPage title={title} description={description}>
      <SignedOutState what={what} />
    </SettingsPage>
  );
}
