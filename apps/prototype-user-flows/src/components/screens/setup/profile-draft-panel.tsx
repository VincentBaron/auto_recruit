"use client";

// The Niche Profile as the setup agent drafts it: live beside the chat (variant A) and as the
// review step of the wizard (variant B). Fields the last agent message changed are highlighted.

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import type { CompanySizeRange, Niche, NicheProfile, SignalWeight } from "@/lib/types";
import { FIELD_LABELS, sizeText } from "./options";
import { cx } from "./ui";

/**
 * Why the company size shows the default range once the agent moved past the size question:
 * "inferred" when it went on from the funding stages, "default" when the Recruiter gave no size.
 */
export type SizeNote = "inferred" | "default" | null;

const SIZE_NOTES: Record<Exclude<SizeNote, null>, string> = {
  inferred: "default, inferred from your stages",
  default: "default",
};

export interface DraftView {
  name: string | null;
  sectors: string[];
  companySize: CompanySizeRange;
  fundingStages: string[];
  locations: string[];
  roleTypes: string[];
  seniority: string[];
  candidateProfile: string;
  fitThreshold: number | null;
  signalWeights: SignalWeight[] | null;
  searchStrategy: string[];
}

export function draftFromNiche(niche: Niche | null, fallback: NicheProfile | null = null): DraftView {
  const p = niche?.profile ?? fallback;
  return {
    name: niche?.setupComplete ? niche.name : null,
    sectors: p?.sectors ?? [],
    companySize: p?.companySize ?? { min: 20, max: 300 },
    fundingStages: p?.fundingStages ?? [],
    locations: p?.locations ?? [],
    roleTypes: p?.roleTypes ?? [],
    seniority: p?.seniority ?? [],
    candidateProfile: p?.candidateProfile ?? "",
    fitThreshold: p?.fitThreshold ?? null,
    signalWeights: p?.signalWeights ?? null,
    searchStrategy: p?.searchStrategy ?? [],
  };
}

function Chips({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800">
          {v}
        </span>
      ))}
    </div>
  );
}

function Waiting({ children = "Waiting for your answer" }: { children?: ReactNode }) {
  return <span className="inline-flex min-h-6 items-center rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-xs leading-snug text-zinc-400">{children}</span>;
}

function Row({ field, label, highlighted, children }: { field: string; label?: string; highlighted: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        "grid grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-md px-2.5 py-2 transition-colors duration-700",
        highlighted ? "bg-indigo-50 ring-1 ring-inset ring-indigo-100" : "",
      )}
    >
      <dt className="pt-1 text-xs text-zinc-500">
        {label ?? FIELD_LABELS[field] ?? field}
        {highlighted ? (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
            <Sparkles className="size-2.5" aria-hidden />
            Updated
          </span>
        ) : null}
      </dt>
      <dd className="min-w-0 text-sm text-zinc-800">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{title}</div>
      <dl className="space-y-0.5">{children}</dl>
    </div>
  );
}

/** Strongest three positive Signals, then every negative one, per audience. */
function signalsSummary(weights: SignalWeight[]) {
  const on = weights.filter((w) => w.enabled);
  const pick = (appliesTo: SignalWeight["appliesTo"]) => {
    const all = on.filter((w) => w.appliesTo === appliesTo);
    const positive = all.filter((w) => w.weight >= 0).sort((a, b) => b.weight - a.weight);
    const negative = all.filter((w) => w.weight < 0).sort((a, b) => a.weight - b.weight);
    const shown = [...positive.slice(0, 3), ...negative];
    return { shown, total: all.length, hidden: all.length - shown.length };
  };
  return { prospect: pick("prospect"), candidate: pick("candidate") };
}

function WeightPill({ w }: { w: SignalWeight }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs",
        w.negative ? "border-red-200 bg-red-50 text-red-700" : "border-zinc-200 bg-white text-zinc-800",
      )}
    >
      {w.label}
      <span className="tabular-nums text-zinc-400">{w.weight > 0 ? `+${w.weight}` : w.weight}</span>
    </span>
  );
}

/**
 * `pending` lists fields not asked yet (rendered as placeholders).
 * `highlighted` lists fields the last agent message updated.
 */
export function ProfileFields({
  draft,
  pending,
  highlighted,
  sizeNote = null,
}: {
  draft: DraftView;
  pending: string[];
  highlighted: string[];
  sizeNote?: SizeNote;
}) {
  const isPending = (f: string) => pending.includes(f);
  const hl = (f: string) => highlighted.includes(f);
  const signals = draft.signalWeights ? signalsSummary(draft.signalWeights) : null;

  return (
    <div className="-mx-2.5">
      <Group title="Target companies">
        <Row field="sectors" highlighted={hl("sectors")}>
          {draft.sectors.length > 0 ? <Chips values={draft.sectors} /> : <Waiting />}
        </Row>
        <Row field="companySize" highlighted={hl("companySize")}>
          {isPending("companySize") ? (
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="tabular-nums text-zinc-500">{sizeText(draft.companySize)}</span>
              <span className="text-[11px] text-zinc-400">(default, asked next)</span>
            </span>
          ) : sizeNote ? (
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="tabular-nums">{sizeText(draft.companySize)}</span>
              <span className="text-[11px] text-zinc-400">({SIZE_NOTES[sizeNote]})</span>
            </span>
          ) : (
            <span className="tabular-nums">{sizeText(draft.companySize)}</span>
          )}
        </Row>
        <Row field="fundingStages" highlighted={hl("fundingStages")}>
          {draft.fundingStages.length > 0 ? <Chips values={draft.fundingStages} /> : isPending("fundingStages") ? <Waiting /> : <span>Any stage</span>}
        </Row>
        <Row field="locations" highlighted={hl("locations")}>
          {draft.locations.length > 0 ? <Chips values={draft.locations} /> : <Waiting />}
        </Row>
      </Group>
      <Group title="Target roles">
        <Row field="roleTypes" highlighted={hl("roleTypes")}>
          {draft.roleTypes.length > 0 ? <Chips values={draft.roleTypes} /> : <Waiting />}
        </Row>
        <Row field="seniority" highlighted={hl("seniority")}>
          {draft.seniority.length > 0 ? <Chips values={draft.seniority} /> : <Waiting />}
        </Row>
        <Row field="candidateProfile" highlighted={hl("candidateProfile")}>
          {draft.candidateProfile && !isPending("candidateProfile") ? (
            <p className="text-[13px] leading-relaxed text-zinc-700">{draft.candidateProfile}</p>
          ) : (
            <Waiting />
          )}
        </Row>
      </Group>
      <Group title="Ranking">
        <Row field="fitThreshold" highlighted={hl("fitThreshold")}>
          {draft.fitThreshold === null || isPending("fitThreshold") ? (
            <Waiting>Set when the draft is complete</Waiting>
          ) : (
            <span className="block">
              <span className="tabular-nums">
                {draft.fitThreshold}
                <span className="text-zinc-400"> / 100</span>
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">Only items at or above it are Surfaced.</span>
            </span>
          )}
        </Row>
        <Row field="signalWeights" label="Signals" highlighted={hl("signalWeights")}>
          {!signals || isPending("signalWeights") ? (
            <Waiting>Set when the draft is complete</Waiting>
          ) : (
            <div className="space-y-2">
              {(["prospect", "candidate"] as const).map((k) => {
                const g = signals[k];
                return (
                  <div key={k}>
                    <div className="mb-1 text-[11px] text-zinc-500">
                      {k === "prospect" ? "Prospects" : "Candidates"} ({g.total} enabled)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.shown.map((w) => (
                        <WeightPill key={w.type} w={w} />
                      ))}
                      {g.hidden > 0 ? <span className="inline-flex h-6 items-center px-1 text-xs text-zinc-400">+{g.hidden} more</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Row>
        <Row field="searchStrategy" highlighted={hl("searchStrategy")}>
          {draft.searchStrategy.length === 0 || isPending("searchStrategy") ? (
            <Waiting>Built when the draft is complete</Waiting>
          ) : (
            <ol className="space-y-1.5">
              {draft.searchStrategy.map((q, i) => (
                <li key={q} className="flex gap-2 text-[13px] leading-snug text-zinc-700">
                  <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-semibold tabular-nums text-zinc-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{q}</span>
                </li>
              ))}
            </ol>
          )}
        </Row>
      </Group>
    </div>
  );
}

/** Six answers the setup agent needs before the draft is complete. */
export function draftProgress(draft: DraftView, pending: string[]): { done: number; total: number } {
  const checks = [
    draft.sectors.length > 0,
    draft.roleTypes.length > 0,
    draft.locations.length > 0,
    draft.seniority.length > 0,
    !pending.includes("companySize"),
    draft.candidateProfile.length > 0 && !pending.includes("candidateProfile"),
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

export function ProfileDraftPanel({
  draft,
  pending,
  highlighted,
  complete,
  footer,
  sizeNote = null,
}: {
  draft: DraftView;
  pending: string[];
  highlighted: string[];
  complete: boolean;
  footer?: ReactNode;
  sizeNote?: SizeNote;
}) {
  const progress = draftProgress(draft, pending);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-xs">
      <div className="border-b border-zinc-100 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Niche Profile draft</h2>
          <span className={cx("text-xs tabular-nums", complete ? "font-medium text-emerald-700" : "text-zinc-500")}>
            {complete ? "Drafted" : `${progress.done} of ${progress.total} answers`}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cx("h-full rounded-full transition-all duration-500", complete ? "bg-emerald-500" : "bg-indigo-500")}
            style={{ width: `${complete ? 100 : Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
        <div className={cx("mt-3 rounded-md px-2.5 py-2", highlighted.includes("name") ? "bg-indigo-50 ring-1 ring-inset ring-indigo-100" : "bg-zinc-50")}>
          <div className="text-[11px] text-zinc-500">Niche name</div>
          <div className={cx("text-sm font-medium [overflow-wrap:anywhere]", draft.name ? "text-zinc-900" : "text-zinc-400")}>
            {draft.name ?? "Named when the draft is complete"}
          </div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <ProfileFields draft={draft} pending={pending} highlighted={highlighted} sizeNote={sizeNote} />
      </div>
      {footer ? <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">{footer}</div> : null}
    </section>
  );
}
