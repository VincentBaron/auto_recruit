// A number with its label, in a card: the same tile on every page (Credits, Campaigns, Niches...).

import type { ReactNode } from "react";
import { cx } from "./cx";

const TONES = {
  default: { ring: "ring-zinc-200", value: "text-zinc-900" },
  warning: { ring: "ring-amber-200", value: "text-amber-700" },
  danger: { ring: "ring-rose-200", value: "text-rose-700" },
} as const;

export function StatTile({ label, value, hint, tone = "default" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "default" | "warning" | "danger" }) {
  const t = TONES[tone];
  return (
    <div className={cx("min-w-0 rounded-xl bg-white p-4 shadow-xs ring-1", t.ring)}>
      <div className="truncate text-xs font-medium text-zinc-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tracking-tight tabular-nums", t.value)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

/** Stat tiles in a row: 2 columns on mobile, as many as fit (10rem minimum) on wider screens. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]", className)}>{children}</div>;
}
