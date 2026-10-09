// One look for a person's lifecycle, retention and Fit everywhere (Feed, people pages, Campaigns, Inbox).

import type { ReactNode } from "react";
import { Hourglass, Lock } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { daysUntil } from "@/lib/format";
import { LIFECYCLE_LABELS } from "@/lib/labels";
import type { ISODate, Lifecycle } from "@/lib/types";

const PILL = "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset";

const LIFECYCLE_TONES: Record<Lifecycle, string> = {
  surfaced: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  dismissed: "bg-zinc-50 text-zinc-500 ring-zinc-200",
  enriched: "bg-violet-50 text-violet-700 ring-violet-200",
  contacted: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  replied: "bg-sky-50 text-sky-700 ring-sky-200",
  consented: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  suppressed: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return <span className={cx(PILL, LIFECYCLE_TONES[lifecycle])}>{LIFECYCLE_LABELS[lifecycle]}</span>;
}

function Pill({ tone, icon, title, children }: { tone: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <span className={cx(PILL, tone)} title={title}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * The retention countdown of a never-Contacted Candidate: neutral beyond 7 days, amber from 7 to 3,
 * red at 2 or less. "On hold" while an open Data Request concerns them (nothing is deleted then).
 */
export function RetentionBadge({ deleteOn, today, onHold = false }: { deleteOn: ISODate | null; today: ISODate; onHold?: boolean }) {
  if (onHold) {
    return (
      <Pill tone="bg-zinc-100 text-zinc-700 ring-zinc-200" icon={<Lock className="size-3 shrink-0" aria-hidden />} title="An open Data Request concerns this person: nothing is deleted until it is answered.">
        On hold: Data Request
      </Pill>
    );
  }
  if (!deleteOn) return null;
  const n = Math.max(0, daysUntil(deleteOn, today));
  const when = n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  const tone = n <= 2 ? "bg-rose-50 text-rose-700 ring-rose-200" : n <= 7 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-zinc-600 ring-zinc-200";
  return (
    <Pill tone={tone} icon={<Hourglass className="size-3 shrink-0" aria-hidden />} title={`Deleted ${when} unless contacted (25-day retention rule).`}>
      Deleted {when}
    </Pill>
  );
}

/** Fit as a number and a thin bar, with the Niche's Fit threshold as a tick. */
export function FitMeter({ score, threshold }: { score: number; threshold: number }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const t = Math.max(0, Math.min(100, threshold));
  const below = v < t;
  return (
    <span className="inline-flex items-center gap-2" title={`Fit ${v}, threshold ${t}`} aria-label={`Fit ${v}, threshold ${t}`} role="img">
      <span className={cx("w-6 text-right text-sm tabular-nums", below ? "text-zinc-500" : "text-zinc-900")}>{v}</span>
      <span className="relative h-1.5 w-14 rounded-full bg-zinc-100" aria-hidden>
        <span className={cx("absolute inset-y-0 left-0 rounded-full", below ? "bg-zinc-400" : "bg-indigo-500")} style={{ width: `${v}%` }} />
        <span className="absolute -top-0.5 h-2.5 w-px bg-zinc-500" style={{ left: `${t}%` }} />
      </span>
    </span>
  );
}
