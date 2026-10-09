"use client";

// Line-by-line explanation of Fit and Signal Strength (ADR-0006): every score can be explained.

import { Check, Minus, X } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import type { Fit, SignalBreakdown } from "@/lib/types";
import { isNegativeSignal } from "./model";
import { cx } from "./ui";

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : String(r);
}

export function FitReasons({ fit }: { fit: Fit }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-900">Fit {fit.score}</p>
        <p className="text-xs text-zinc-500 tabular-nums">threshold {fit.threshold}</p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {fit.reasons.map((r) => (
          <li key={r.label} className="flex items-start gap-2 text-xs">
            <span
              className={cx(
                "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
                r.matched === "yes" ? "bg-emerald-50 text-emerald-600" : r.matched === "partial" ? "bg-amber-50 text-amber-600" : "bg-zinc-100 text-zinc-400",
              )}
              aria-label={r.matched === "yes" ? "Fits" : r.matched === "partial" ? "Partly fits" : "Does not fit"}
            >
              {r.matched === "yes" ? <Check className="size-3" aria-hidden /> : r.matched === "partial" ? <Minus className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1 text-zinc-700">{r.label}</span>
            <span className="shrink-0 text-zinc-500 tabular-nums">
              {r.points}/{r.maxPoints}
            </span>
          </li>
        ))}
      </ul>
      <p className={cx("mt-2 text-xs", fit.aboveThreshold ? "text-zinc-500" : "font-medium text-rose-700")}>{fit.summary}</p>
    </div>
  );
}

export function BreakdownTable({ breakdown }: { breakdown: SignalBreakdown }) {
  if (breakdown.lines.length === 0) {
    return <p className="text-xs text-zinc-500">No Signal yet: Signal Strength is 0.</p>;
  }
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-900">Signal Strength {breakdown.total}</p>
        <p className="text-xs text-zinc-500 tabular-nums">raw {breakdown.rawTotal}</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="text-left whitespace-nowrap text-zinc-500">
              <th className="py-1 pr-2 font-medium">Signal</th>
              <th className="px-2 py-1 text-right font-medium">Age</th>
              <th className="px-2 py-1 text-right font-medium">Points</th>
              <th className="px-2 py-1 text-right font-medium">Half-life</th>
              <th className="px-2 py-1 text-right font-medium">Decay</th>
              <th className="py-1 pl-2 text-right font-medium">Adds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums">
            {breakdown.lines.map((l) => (
              <tr key={l.signalId} className={cx(!l.enabled && "text-zinc-400")}>
                <td className="py-1 pr-2">
                  <span className={cx(l.enabled ? (l.negative || isNegativeSignal(l.type) ? "text-rose-700" : "text-zinc-800") : "line-through")}>{l.label}</span>
                  <span className="ml-1.5 text-zinc-400">{formatDateShort(l.date)}</span>
                  {!l.enabled && <span className="ml-1.5 text-zinc-400">(weight off)</span>}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap text-zinc-500">{l.ageDays}d</td>
                <td className="px-2 py-1 text-right">{signed(l.points)}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap text-zinc-500">{l.halfLifeDays}d</td>
                <td className="px-2 py-1 text-right text-zinc-500">x{l.decay.toFixed(2)}</td>
                <td className={cx("py-1 pl-2 text-right font-medium", l.contribution < 0 ? "text-rose-700" : "text-zinc-900")}>{signed(l.contribution)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 font-semibold text-zinc-900">
              <td className="py-1 pr-2" colSpan={5}>
                Total, clamped to 0-100
              </td>
              <td className="py-1 pl-2 text-right tabular-nums">{breakdown.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">{breakdown.formula}</p>
    </div>
  );
}

/** Both explanations side by side, as shown under a result. */
export function ScoreExplainer({ fit, breakdown }: { fit: Fit; breakdown: SignalBreakdown }) {
  return (
    <div className="grid gap-5 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <FitReasons fit={fit} />
      <BreakdownTable breakdown={breakdown} />
    </div>
  );
}
