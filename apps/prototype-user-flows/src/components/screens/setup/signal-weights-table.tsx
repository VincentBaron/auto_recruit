"use client";

// Signal weights of a Niche Profile: enable, weight (points before decay) and half-life, with the
// value left after 30 and 90 days so the decay is explicit (ADR-0006). A table from sm, one stacked
// row per Signal below it (no horizontal scroll on a phone).

import type { SignalWeight } from "@/lib/types";
import { decayedValue, oneDecimal } from "./options";
import { Badge, Switch, cx, inputBaseClass } from "./ui";

type OnChange = (type: SignalWeight["type"], patch: Partial<SignalWeight>) => void;

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function WeightInput({ w, onChange }: { w: SignalWeight; onChange: OnChange }) {
  return (
    <div className="relative">
      <input
        type="number"
        step={5}
        min={w.negative ? -100 : 0}
        max={w.negative ? 0 : 100}
        value={w.weight}
        disabled={!w.enabled}
        aria-label={`Weight of ${w.label}`}
        onChange={(e) => {
          if (e.target.value === "" || e.target.value === "-") return;
          onChange(w.type, { weight: clamp(Number(e.target.value), w.negative ? -100 : 0, w.negative ? 0 : 100) });
        }}
        className={cx(inputBaseClass, "h-8 w-full pr-7 text-right text-sm tabular-nums", w.negative && "text-red-700")}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-zinc-400">pts</span>
    </div>
  );
}

function HalfLifeInput({ w, onChange }: { w: SignalWeight; onChange: OnChange }) {
  return (
    <div className="relative">
      <input
        type="number"
        step={5}
        min={5}
        max={365}
        value={w.halfLifeDays}
        disabled={!w.enabled}
        aria-label={`Half-life of ${w.label} in days`}
        onChange={(e) => {
          if (e.target.value === "") return;
          onChange(w.type, { halfLifeDays: clamp(Number(e.target.value), 1, 365) });
        }}
        className={cx(inputBaseClass, "h-8 w-full pr-9 text-right text-sm tabular-nums")}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-zinc-400">days</span>
    </div>
  );
}

function decayTone(w: SignalWeight, value: number, muted: string): string {
  if (!w.enabled) return "text-zinc-300";
  return value < 0 ? "text-red-700" : muted;
}

function SignalName({ w }: { w: SignalWeight }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-zinc-900">{w.label}</span>
        {w.negative ? <Badge tone="red">Counts against</Badge> : null}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{w.description}</div>
    </>
  );
}

function TableGroup({ title, description, weights, onChange }: { title: string; description: string; weights: SignalWeight[]; onChange: OnChange }) {
  return (
    <tbody className="divide-y divide-zinc-100">
      <tr className="bg-zinc-50/80">
        <th colSpan={6} scope="colgroup" className="px-4 py-2 text-left">
          <span className="text-xs font-semibold text-zinc-700">{title}</span>
          <span className="ml-2 text-xs font-normal text-zinc-500">{description}</span>
        </th>
      </tr>
      {weights.map((w) => {
        const after30 = decayedValue(w, 30);
        const after90 = decayedValue(w, 90);
        return (
          <tr key={w.type} className={cx("align-middle", !w.enabled && "bg-zinc-50/40")}>
            <td className="w-14 py-2.5 pl-4 pr-2">
              <Switch checked={w.enabled} onChange={(v) => onChange(w.type, { enabled: v })} label={`${w.enabled ? "Disable" : "Enable"} ${w.label}`} />
            </td>
            <td className={cx("px-3 py-2.5", !w.enabled && "opacity-55")}>
              <SignalName w={w} />
            </td>
            <td className="w-24 px-2 py-2.5">
              <WeightInput w={w} onChange={onChange} />
            </td>
            <td className="w-28 px-2 py-2.5">
              <HalfLifeInput w={w} onChange={onChange} />
            </td>
            <td className={cx("hidden w-[72px] px-2 py-2.5 text-right tabular-nums md:table-cell", decayTone(w, after30, "text-zinc-700"))}>
              {w.enabled ? oneDecimal(after30) : "0.0"}
            </td>
            <td className={cx("hidden w-[76px] py-2.5 pl-2 pr-4 text-right tabular-nums md:table-cell", decayTone(w, after90, "text-zinc-500"))}>
              {w.enabled ? oneDecimal(after90) : "0.0"}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

/** Below sm: toggle and name, then Weight and Half-life side by side, then the decayed values. */
function StackedGroup({ title, description, weights, onChange }: { title: string; description: string; weights: SignalWeight[]; onChange: OnChange }) {
  return (
    <section className="border-t border-zinc-100 first:border-t-0">
      <h3 className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-xs">
        <span className="font-semibold text-zinc-700">{title}</span>
        <span className="mt-0.5 block font-normal text-zinc-500">{description}</span>
      </h3>
      <ul className="divide-y divide-zinc-100">
        {weights.map((w) => {
          const after30 = decayedValue(w, 30);
          const after90 = decayedValue(w, 90);
          return (
            <li key={w.type} className={cx("space-y-2.5 px-4 py-3", !w.enabled && "bg-zinc-50/40")}>
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Switch checked={w.enabled} onChange={(v) => onChange(w.type, { enabled: v })} label={`${w.enabled ? "Disable" : "Enable"} ${w.label}`} />
                </div>
                <div className={cx("min-w-0 flex-1 text-sm", !w.enabled && "opacity-55")}>
                  <SignalName w={w} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">Weight</div>
                  <WeightInput w={w} onChange={onChange} />
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">Half-life</div>
                  <HalfLifeInput w={w} onChange={onChange} />
                </div>
              </div>
              <dl className="flex gap-4 text-xs">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-zinc-500">At 30 days</dt>
                  <dd className={cx("font-medium tabular-nums", decayTone(w, after30, "text-zinc-700"))}>{w.enabled ? oneDecimal(after30) : "0.0"}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-zinc-500">At 90 days</dt>
                  <dd className={cx("font-medium tabular-nums", decayTone(w, after90, "text-zinc-500"))}>{w.enabled ? oneDecimal(after90) : "0.0"}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PROSPECT_GROUP = { title: "Prospect Signals", description: "Is this company likely to hire?" };
const CANDIDATE_GROUP = { title: "Candidate Signals", description: "Is this person likely to move?" };

export function SignalWeightsTable({ weights, onChange }: { weights: SignalWeight[]; onChange: OnChange }) {
  const prospect = weights.filter((w) => w.appliesTo === "prospect");
  const candidate = weights.filter((w) => w.appliesTo === "candidate");
  return (
    <>
      <div className="sm:hidden">
        <StackedGroup {...PROSPECT_GROUP} weights={prospect} onChange={onChange} />
        <StackedGroup {...CANDIDATE_GROUP} weights={candidate} onChange={onChange} />
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[440px] text-sm md:min-w-[600px]">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2 pl-4 pr-2 font-medium">On</th>
              <th className="px-3 py-2 font-medium">Signal</th>
              <th className="px-2 py-2 text-right font-medium">Weight</th>
              <th className="px-2 py-2 text-right font-medium">Half-life</th>
              <th className="hidden whitespace-nowrap px-2 py-2 text-right font-medium md:table-cell">At 30 days</th>
              <th className="hidden whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium md:table-cell">At 90 days</th>
            </tr>
          </thead>
          <TableGroup {...PROSPECT_GROUP} weights={prospect} onChange={onChange} />
          <TableGroup {...CANDIDATE_GROUP} weights={candidate} onChange={onChange} />
        </table>
      </div>
    </>
  );
}
