"use client";

import { Building, Info, Search, User, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import type { Niche } from "@/lib/types";
import { type FeedModel, type FeedTab, type FeedVariant, type FeedView, type NicheFilter, nicheName, nicheShortName } from "./model";
import { NicheDot } from "./parts";
import { cx } from "./ui";

export function FeedTabs({
  tab,
  counts,
  onTab,
}: {
  tab: FeedTab;
  counts: { prospects: number; candidates: number };
  onTab: (t: FeedTab) => void;
}) {
  const tabs: { key: FeedTab; label: string; count: number; icon: typeof Building }[] = [
    { key: "prospects", label: "Prospects", count: counts.prospects, icon: Building },
    { key: "candidates", label: "Candidates", count: counts.candidates, icon: User },
  ];
  return (
    <div role="tablist" aria-label="Feed" className="-mb-px flex gap-5">
      {tabs.map((t) => {
        const active = t.key === tab;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onTab(t.key)}
            className={cx(
              "inline-flex items-center gap-2 border-b-2 px-0.5 pt-1 pb-2.5 text-sm font-medium transition-colors",
              active ? "border-indigo-600 text-zinc-900" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
          >
            <Icon className={cx("size-4", active ? "text-indigo-600" : "text-zinc-400")} aria-hidden />
            {t.label}
            <span
              className={cx(
                "rounded-full px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums",
                active ? "bg-indigo-50 text-indigo-700" : "bg-zinc-100 text-zinc-500",
              )}
            >
              {formatNumber(t.count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Niche filter. `niches` are the ready Niches with items in the current tab, so there is never an
 * empty option; the selected Niche stays listed even when this tab has nothing for it.
 */
export function NicheSelect({
  model,
  niches,
  value,
  onChange,
}: {
  model: FeedModel;
  niches: Niche[];
  value: NicheFilter;
  onChange: (v: NicheFilter) => void;
}) {
  const selected = value !== "all" && value !== "mine" ? model.nicheById.get(value) : undefined;
  const options = selected && !niches.includes(selected) ? [...niches, selected] : niches;
  const mine = options.filter((n) => n.ownerId === model.me?.id);
  const showMine = value === "mine" || (mine.length > 0 && mine.length < options.length);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Niche" className="w-full min-w-0 sm:w-[300px]">
      <option value="all">All Niches</option>
      {showMine ? <option value="mine">My Niches</option> : null}
      {options.map((n) => (
        <option key={n.id} value={n.id}>
          {nicheOptionLabel(model, n)}
        </option>
      ))}
    </Select>
  );
}

function nicheOptionLabel(model: FeedModel, n: Niche): string {
  const owner = n.ownerId === model.me?.id ? "" : ` (${model.recruiterById.get(n.ownerId)?.name ?? "another Recruiter"})`;
  return `${nicheName(n)}${owner}`;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center sm:max-w-[280px]">
      <Search className="pointer-events-none absolute left-2.5 size-4 text-zinc-400" aria-hidden />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-zinc-300 bg-white pr-8 pl-8 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 hover:border-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 rounded p-0.5 text-zinc-400 hover:text-zinc-700" aria-label="Clear search" title="Clear search">
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function ViewToggle({ view, dismissedCount, onView }: { view: FeedView; dismissedCount: number; onView: (v: FeedView) => void }) {
  const opts: { key: FeedView; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "dismissed", label: `Dismissed ${dismissedCount > 0 ? formatNumber(dismissedCount) : ""}`.trim() },
  ];
  return (
    <div className="inline-flex h-8 shrink-0 items-center rounded-md bg-zinc-100 p-0.5" role="radiogroup" aria-label="Show">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={view === o.key}
          onClick={() => onView(o.key)}
          className={cx(
            "h-7 rounded px-2.5 text-xs font-medium tabular-nums transition-colors",
            view === o.key ? "bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const HOW_TO_EXPLAIN: Record<FeedVariant, string> = {
  A: "Click a row for the line-by-line explanation of both scores.",
  B: "Pick an item for the line-by-line explanation of both scores.",
  C: "Each card shows the line-by-line explanation of both scores.",
};

/** How the Feed ranks, and the legend of the Niche dots (only Niches with items in this tab). */
export function RankingCaption({ niches, variant }: { niches: Niche[]; variant: FeedVariant }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs text-zinc-500 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <p className="flex items-start gap-1.5">
        <Info className="mt-px size-3.5 shrink-0 text-zinc-400" aria-hidden />
        <span>Ranked by Signal Strength among items at or above each Niche&apos;s Fit threshold. {HOW_TO_EXPLAIN[variant]}</span>
      </p>
      {niches.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 lg:shrink-0 lg:pl-0" aria-label="Niches and Fit thresholds">
          {niches.map((n) => (
            <li key={n.id} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={nicheName(n)}>
              <NicheDot niche={n} />
              <span className="text-zinc-600">{nicheShortName(n)}</span>
              <span className="text-zinc-400 tabular-nums">Fit {n.profile.fitThreshold}+</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
