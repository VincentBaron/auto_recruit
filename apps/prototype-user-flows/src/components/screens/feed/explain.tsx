"use client";

// Every score explained line by line (ADR-0006): Signal Strength from dated Signals with weights and
// age decay, Fit from the Niche Profile criteria.

import { Check, ExternalLink, Minus, X } from "lucide-react";
import { formatDate, formatDateShort, formatRelative, plural } from "@/lib/format";
import { SIGNAL_TYPE_LABELS } from "@/lib/labels";
import type { Fit, Signal, SignalBreakdown } from "@/lib/types";
import { Badge, Button, cx } from "./ui";

function signed(n: number, digits = 1): string {
  const fixed = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${fixed}`;
  if (n < 0) return `-${fixed}`;
  return fixed;
}

function SignalName({ line, isNew }: { line: SignalBreakdown["lines"][number]; isNew: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={cx("font-medium", line.enabled ? (line.negative ? "text-rose-700" : "text-zinc-800") : "line-through")}>{SIGNAL_TYPE_LABELS[line.type]}</span>
      {isNew ? <Badge tone="indigo">New</Badge> : null}
    </div>
  );
}

/** What the Signal says, with its evidence link (none for a Preview: nothing that identifies anyone). */
function SignalLabel({ line, signal, truncate }: { line: SignalBreakdown["lines"][number]; signal: Signal | undefined; truncate: boolean }) {
  const text = line.enabled ? line.label : "Weight disabled in this Niche";
  const link = signal ? (
    <a
      href={signal.evidenceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex shrink-0 items-center align-[-2px] text-indigo-600 hover:text-indigo-800"
      title={`Evidence: ${signal.source}`}
    >
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">Evidence: {signal.source}</span>
    </a>
  ) : null;
  if (!truncate) {
    // On a phone the label wraps and the evidence link follows its last word.
    return (
      <p className="mt-0.5 break-words text-zinc-500">
        {text} {link}
      </p>
    );
  }
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-zinc-500">
      <span className="min-w-0 truncate" title={line.label}>
        {text}
      </span>
      {link}
    </div>
  );
}

function addsTone(line: SignalBreakdown["lines"][number]): string {
  return !line.enabled ? "text-zinc-400" : line.contribution < 0 ? "text-rose-700" : "text-zinc-900";
}

/**
 * The Signal Strength line by line. A table from sm; on a phone, one stacked block per Signal (the
 * Age and Points x decay columns become a meta line), so nothing is squeezed or cut.
 */
export function SignalStrengthExplainer({
  breakdown,
  signals,
  today,
  newSignalId,
}: {
  breakdown: SignalBreakdown;
  signals: Signal[];
  today: string;
  newSignalId?: string | null;
}) {
  const byId = new Map(signals.map((s) => [s.id, s]));
  if (breakdown.lines.length === 0) {
    return <p className="text-sm text-zinc-500">No Signals yet, so the Signal Strength is 0.</p>;
  }
  const formula = `${breakdown.formula || "Sum of points x 0.5^(age in days / half-life), clamped to 0-100"}. As of ${formatDate(today)}.`;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
      <ul className="divide-y divide-zinc-100 text-xs sm:hidden">
        {breakdown.lines.map((l) => {
          const isNew = newSignalId === l.signalId;
          return (
            <li key={l.signalId} className={cx("px-3 py-2", !l.enabled && "text-zinc-400", isNew && "bg-indigo-50/60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SignalName line={l} isNew={isNew} />
                  <SignalLabel line={l} signal={byId.get(l.signalId)} truncate={false} />
                </div>
                <span className={cx("shrink-0 font-semibold tabular-nums", addsTone(l))}>{signed(l.contribution)}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                {formatDateShort(l.date)} · {formatRelative(l.date, today)} · {signed(l.points, 0)} x {l.decay.toFixed(2)} · half-life{" "}
                {plural(l.halfLifeDays, "day")}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[400px] text-left text-xs">
          <thead className="bg-zinc-50 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Signal</th>
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">Age</th>
              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap" title="Points x 0.5 ^ (age in days / half-life)">
                Points x decay
              </th>
              <th className="px-3 py-1.5 text-right font-medium">Adds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {breakdown.lines.map((l) => {
              const isNew = newSignalId === l.signalId;
              return (
                <tr key={l.signalId} className={cx(!l.enabled && "text-zinc-400", isNew && "bg-indigo-50/60")}>
                  <td className="max-w-0 px-3 py-1.5 align-top">
                    <SignalName line={l} isNew={isNew} />
                    <SignalLabel line={l} signal={byId.get(l.signalId)} truncate />
                  </td>
                  <td className="w-[1%] px-2 py-1.5 align-top whitespace-nowrap text-zinc-600 tabular-nums">
                    <div>{formatDateShort(l.date)}</div>
                    <div className="text-[11px] text-zinc-400">{formatRelative(l.date, today)}</div>
                  </td>
                  <td className="w-[1%] px-2 py-1.5 text-right align-top whitespace-nowrap tabular-nums">
                    <div>
                      {signed(l.points, 0)} <span className="text-zinc-400">x</span> {l.decay.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-zinc-400">half-life {plural(l.halfLifeDays, "day")}</div>
                  </td>
                  <td className={cx("w-[1%] px-3 py-1.5 text-right align-top font-semibold whitespace-nowrap tabular-nums", addsTone(l))}>{signed(l.contribution)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-200 bg-zinc-50/60 px-3 pt-1.5 pb-2 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-zinc-600">Sum {breakdown.rawTotal.toFixed(1)}, clamped to 0-100</span>
          <span className="text-sm font-semibold text-indigo-700 tabular-nums">{breakdown.total}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-400">{formula}</p>
      </div>
    </div>
  );
}

const MATCH_ICON = {
  yes: <Check className="size-3.5 text-emerald-600" aria-label="Matches" />,
  partial: <Minus className="size-3.5 text-amber-600" aria-label="Partly matches" />,
  no: <X className="size-3.5 text-rose-600" aria-label="Does not match" />,
};

export function FitExplainer({ fit }: { fit: Fit }) {
  const pct = Math.max(0, Math.min(100, fit.score));
  const threshold = Math.max(0, Math.min(100, fit.threshold));
  // The same colours as core's FitMeter: indigo at or above the threshold, grey below, a grey tick.
  return (
    <div className="rounded-lg p-3 ring-1 ring-zinc-200">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-zinc-700">{fit.summary}</p>
        <p className="shrink-0 text-xs text-zinc-500 tabular-nums">
          <span className="text-sm font-semibold text-zinc-900">{fit.score}</span> / 100
        </p>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-zinc-100" aria-hidden>
        <div className={cx("absolute inset-y-0 left-0 rounded-full", pct < threshold ? "bg-zinc-400" : "bg-indigo-500")} style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 -bottom-1 w-px bg-zinc-500" style={{ left: `${threshold}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Fit threshold {fit.threshold}: only items at or above it are Surfaced.</p>
      <ul className="mt-2.5 space-y-1.5">
        {fit.reasons.map((r) => (
          <li key={r.label} className="flex items-start gap-2 text-xs">
            <span className="mt-px shrink-0">{MATCH_ICON[r.matched]}</span>
            <span className="min-w-0 flex-1 text-zinc-700">{r.label}</span>
            <span className="shrink-0 text-zinc-500 tabular-nums">
              {r.points}/{r.maxPoints}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Signals as a dated timeline with evidence links. */
export function SignalTimeline({
  signals,
  today,
  newSignalId,
  onMarkSeen,
}: {
  signals: Signal[];
  today: string;
  newSignalId?: string | null;
  onMarkSeen?: () => void;
}) {
  // ISO dates order as plain strings: newest first, the same on every locale.
  const sorted = [...signals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (sorted.length === 0) return <p className="text-sm text-zinc-500">No Signals yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-zinc-200 pl-4">
      {sorted.map((s) => {
        const negative = s.points < 0;
        const isNew = s.id === newSignalId;
        return (
          <li key={s.id} className="relative">
            <span
              className={cx(
                "absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-white",
                isNew ? "bg-indigo-600" : negative ? "bg-rose-400" : "bg-zinc-300",
              )}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cx("text-xs font-medium", negative ? "text-rose-700" : "text-zinc-800")}>{SIGNAL_TYPE_LABELS[s.type]}</span>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {formatDate(s.date)} · {formatRelative(s.date, today)}
              </span>
              {isNew ? (
                <>
                  <Badge tone="indigo">New Signal</Badge>
                  {onMarkSeen ? (
                    <Button size="xs" tone="ghost" onClick={onMarkSeen}>
                      Mark as seen
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-zinc-700">{s.label}</p>
            <a
              href={s.evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-indigo-600 hover:underline"
            >
              <ExternalLink className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{s.source}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Top Signals as compact chips, sorted by what they add to the Signal Strength. */
export function SignalChips({
  breakdown,
  max = 2,
  newSignalId,
  wrap = false,
}: {
  breakdown: SignalBreakdown;
  max?: number;
  newSignalId?: string | null;
  /** Long labels break onto a second line instead of being cut (the Table's narrow column). */
  wrap?: boolean;
}) {
  const lines = [...breakdown.lines].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const shown = lines.slice(0, max);
  const rest = lines.slice(shown.length);
  if (lines.length === 0) return <span className="text-xs text-zinc-400">No Signals</span>;
  return (
    <span className={cx("flex min-w-0 gap-1", wrap ? "items-start" : "items-center")}>
      {shown.map((l) => (
        <Badge
          key={l.signalId}
          tone={l.signalId === newSignalId ? "indigo" : l.negative ? "danger" : "outline"}
          title={`${l.label} · ${formatDate(l.date)} · adds ${signed(l.contribution)} to the Signal Strength`}
          className="min-w-0"
          wrap={wrap}
        >
          {SIGNAL_TYPE_LABELS[l.type]}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <span className={cx("shrink-0 text-xs text-zinc-400 tabular-nums", wrap && "pt-0.5")} title={rest.map((l) => SIGNAL_TYPE_LABELS[l.type]).join(", ")}>
          +{rest.length}
        </span>
      ) : null}
    </span>
  );
}
