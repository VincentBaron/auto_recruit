"use client";

// One card per Test Run result: a Prospect in full, a revealed Candidate, or a Candidate Preview.
// Every card carries good / bad labels and a line-by-line score explanation.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Briefcase, ChevronDown, ExternalLink, Lock, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { FitMeter, LifecycleBadge, RetentionBadge } from "@/components/domain/person-badges";
import { formatDateShort, formatEurosCompact, formatNumber, formatRelative, formatTenure, initials } from "@/lib/format";
import { CONSENT_LABELS } from "@/lib/labels";
import type { Candidate, DetectedRole, Fit, HiringContact, ISODate, Preview, Prospect, Signal, SignalBreakdown, TestRunLabel } from "@/lib/types";
import { isNegativeSignal } from "./model";
import { ScoreExplainer } from "./score-explainer";
import { Badge, cx, SignalStrengthMeter } from "./ui";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

export function LabelToggle({ value, onChange, name }: { value: TestRunLabel | null; onChange: (label: TestRunLabel) => void; name: string }) {
  return (
    <div role="group" aria-label={`Label ${name}`} className="inline-flex shrink-0 self-start rounded-md border border-zinc-200 bg-white p-0.5 shadow-xs">
      <button
        type="button"
        aria-pressed={value === "good"}
        onClick={() => onChange("good")}
        className={cx(
          "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
          value === "good" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden />
        Good
      </button>
      <button
        type="button"
        aria-pressed={value === "bad"}
        onClick={() => onChange("bad")}
        className={cx(
          "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
          value === "bad" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 ring-inset" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
        )}
      >
        <ThumbsDown className="size-3.5" aria-hidden />
        Bad
      </button>
    </div>
  );
}

function cardFrame(label: TestRunLabel | null): string {
  return cx(
    "@container overflow-hidden rounded-lg border bg-white shadow-xs transition-colors",
    label === "good" ? "border-emerald-300" : label === "bad" ? "border-rose-300" : "border-zinc-200",
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{children}</p>;
}

/** Every Test Run result was above the Fit threshold when the run kept it: below now means a later change. */
function BelowThresholdBadge() {
  return (
    <Badge tone="red" title="Above the Fit threshold when the Test Run ran, below it since a later Niche Profile change.">
      Below the Fit threshold
    </Badge>
  );
}

/** One Signal: a red bullet and "Counts against" for the negative ones (layoffs, recently started or promoted). */
function SignalItem({ label, negative, meta }: { label: string; negative: boolean; meta?: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm">
      <span className={cx("mt-2 size-1.5 shrink-0 rounded-full", negative ? "bg-rose-500" : "bg-indigo-500")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cx("min-w-0 leading-5", negative ? "text-rose-700" : "text-zinc-800")}>{label}</span>
          {negative && (
            <Badge tone="red" title="A negative Signal: it lowers the Signal Strength.">
              Counts against
            </Badge>
          )}
        </p>
        {meta && <p className="flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-zinc-500">{meta}</p>}
      </div>
    </li>
  );
}

function SignalDate({ date, today }: { date: ISODate; today: ISODate }) {
  return (
    <span className="whitespace-nowrap">
      {formatDateShort(date)} · {formatRelative(date, today)}
    </span>
  );
}

function SignalList({ signals, today }: { signals: Signal[]; today: ISODate }) {
  if (signals.length === 0) return <p className="text-xs text-zinc-500">No Signal found.</p>;
  const sorted = [...signals].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <ul className="space-y-2">
      {sorted.map((s) => (
        <SignalItem
          key={s.id}
          label={s.label}
          negative={isNegativeSignal(s.type) || s.points < 0}
          meta={
            <>
              <SignalDate date={s.date} today={today} />
              <span aria-hidden>·</span>
              <a
                href={s.evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-0.5 underline decoration-zinc-300 underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-300"
              >
                <span className="truncate">{s.source}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </>
          }
        />
      ))}
    </ul>
  );
}

/** A Preview's Signals, anonymised: no evidence link, since it would tell who the person is. */
function PreviewSignalList({ preview, today }: { preview: Preview; today: ISODate }) {
  const lines = preview.breakdown.lines;
  if (lines.length === 0 && preview.signalLabels.length === 0) return <p className="text-xs text-zinc-500">No Signal found.</p>;
  return (
    <ul className="space-y-2">
      {lines.length > 0
        ? lines.map((l) => (
            <SignalItem key={l.signalId} label={capitalize(l.label)} negative={isNegativeSignal(l.type) || l.negative} meta={<SignalDate date={l.date} today={today} />} />
          ))
        : preview.signalLabels.map((l) => <SignalItem key={l} label={capitalize(l)} negative={false} />)}
    </ul>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ScoresColumn({
  fit,
  fitThreshold,
  signalStrength,
  open,
  onToggle,
  summary,
}: {
  fit: number;
  fitThreshold: number;
  signalStrength: number;
  open: boolean;
  onToggle: () => void;
  summary?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <dl className="grid w-full max-w-52 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <dt className="truncate text-xs text-zinc-500">Fit</dt>
        <dd>
          <FitMeter score={fit} threshold={fitThreshold} />
        </dd>
        <dt className="truncate text-xs text-zinc-500">Signal Strength</dt>
        <dd>
          <SignalStrengthMeter value={signalStrength} />
        </dd>
      </dl>
      {summary && <p className="text-xs text-zinc-500">{summary}</p>}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
      >
        {open ? "Hide explanation" : "Explain scores"}
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
    </div>
  );
}

function Explanation({ fit, breakdown }: { fit: Fit; breakdown: SignalBreakdown }) {
  return (
    <div className="@container border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
      <ScoreExplainer fit={fit} breakdown={breakdown} />
    </div>
  );
}

/** Columns of a result card: scores on the left, facts on the right (stacked in a narrow card). */
const CARD_BODY = "grid gap-4 border-t border-zinc-100 px-4 py-3 @xl:grid-cols-[208px_minmax(0,1fr)]";

function PreviewAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200 ring-inset" aria-hidden>
      <Lock className="size-3.5" />
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 ring-inset" aria-hidden>
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Prospect                                                            */
/* ------------------------------------------------------------------ */

export function ProspectResult({
  prospect,
  roles,
  hiringContacts,
  hiringContactPreviews,
  freeTrial,
  fitThreshold,
  today,
  label,
  onLabel,
}: {
  prospect: Prospect;
  roles: DetectedRole[];
  hiringContacts: HiringContact[];
  hiringContactPreviews: Preview[];
  freeTrial: boolean;
  fitThreshold: number;
  today: ISODate;
  label: TestRunLabel | null;
  onLabel: (label: TestRunLabel) => void;
}) {
  const [open, setOpen] = useState(false);
  const funding = prospect.latestFunding;
  const city = prospect.location;
  const peopleCount = freeTrial ? hiringContactPreviews.length : hiringContacts.length;

  return (
    <article className={cardFrame(label)}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3 @md:flex-row @md:items-start @md:justify-between @md:gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/prospects/${prospect.id}`} className="truncate text-sm font-semibold text-zinc-900 hover:text-indigo-700">
              {prospect.name}
            </Link>
            <span className="truncate text-xs text-zinc-500">{prospect.domain}</span>
            {!prospect.fit.aboveThreshold && <BelowThresholdBadge />}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {prospect.sector} · {formatNumber(prospect.headcount)} people · {city} · Founded {prospect.founded}
            {funding && (
              <>
                {" "}
                · {funding.round} {formatEurosCompact(funding.amountEur)}, {formatRelative(funding.on, today)}
              </>
            )}
          </p>
        </div>
        <LabelToggle value={label} onChange={onLabel} name={prospect.name} />
      </div>

      <div className={CARD_BODY}>
        <ScoresColumn
          fit={prospect.fit.score}
          fitThreshold={fitThreshold}
          signalStrength={prospect.signalStrength}
          summary={prospect.fit.aboveThreshold ? prospect.fit.summary : undefined}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
        <div className="min-w-0 space-y-3">
          <div>
            <SubHeading>Signals</SubHeading>
            <SignalList signals={prospect.signals} today={today} />
          </div>
          <div>
            <SubHeading>Detected Roles</SubHeading>
            {roles.length === 0 ? (
              <p className="text-xs text-zinc-500">No Detected Role yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <a
                    key={r.id}
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`Evidence: ${r.sourceUrl}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-300 hover:bg-white"
                  >
                    <Briefcase className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="shrink-0 text-zinc-500">posted {formatRelative(r.postedOn, today)}</span>
                    {r.stale && <span className="shrink-0 rounded bg-amber-100 px-1 text-[11px] font-medium text-amber-800">Open 30+ days</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            <SubHeading>
              Hiring Contacts {peopleCount > 0 && <span className="font-normal text-zinc-400 normal-case">{peopleCount}</span>}
            </SubHeading>
            {freeTrial ? (
              hiringContactPreviews.length === 0 ? (
                <p className="text-xs text-zinc-500">No Hiring Contact found.</p>
              ) : (
                <ul className="space-y-1.5">
                  {hiringContactPreviews.map((pv) => (
                    <li key={pv.id} className="flex min-w-0 items-center gap-2">
                      <PreviewAvatar />
                      <span className="min-w-0 flex-1 text-sm text-zinc-700">{pv.summary}</span>
                      <Badge tone="neutral">Preview</Badge>
                    </li>
                  ))}
                </ul>
              )
            ) : hiringContacts.length === 0 ? (
              <p className="text-xs text-zinc-500">No Hiring Contact found.</p>
            ) : (
              <ul className="space-y-1.5">
                {hiringContacts.map((h) => (
                  <li key={h.id} className="flex min-w-0 items-center gap-2">
                    <Avatar name={h.name} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium text-zinc-900">{h.name}</span>
                      <span className="text-zinc-500"> · {h.title}</span>
                    </span>
                    {h.lifecycle !== "surfaced" && <LifecycleBadge lifecycle={h.lifecycle} />}
                    <span className="w-5 shrink-0 text-right text-xs text-zinc-500 tabular-nums" title={`Rank ${h.rank} to contact`}>
                      #{h.rank}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {open && <Explanation fit={prospect.fit} breakdown={prospect.breakdown} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Candidate (revealed)                                                */
/* ------------------------------------------------------------------ */

export function CandidateResult({
  candidate,
  fitThreshold,
  today,
  onHold,
  label,
  onLabel,
}: {
  candidate: Candidate;
  fitThreshold: number;
  today: ISODate;
  /** An open Data Request concerns this Candidate: retention is on hold. */
  onHold: boolean;
  label: TestRunLabel | null;
  onLabel: (label: TestRunLabel) => void;
}) {
  const [open, setOpen] = useState(false);
  // The 25-day retention countdown applies until the Candidate is Contacted or gives consent.
  const retention = candidate.consent === null && candidate.deleteOn !== null;

  return (
    <article className={cardFrame(label)}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3 @md:flex-row @md:items-start @md:justify-between @md:gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={candidate.name} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/candidates/${candidate.id}`} className="truncate text-sm font-semibold text-zinc-900 hover:text-indigo-700">
                {candidate.name}
              </Link>
              {candidate.lifecycle !== "surfaced" && <LifecycleBadge lifecycle={candidate.lifecycle} />}
              {!candidate.fit.aboveThreshold && <BelowThresholdBadge />}
            </div>
            <p className="mt-0.5 text-xs text-zinc-600">
              {candidate.currentTitle} at {candidate.currentEmployer}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {candidate.location} · {candidate.yearsExperience} years of experience · {formatTenure(candidate.tenureMonths)} in the current role
            </p>
          </div>
        </div>
        <LabelToggle value={label} onChange={onLabel} name={candidate.name} />
      </div>

      <div className={CARD_BODY}>
        <ScoresColumn
          fit={candidate.fit.score}
          fitThreshold={fitThreshold}
          signalStrength={candidate.signalStrength}
          summary={candidate.fit.aboveThreshold ? candidate.fit.summary : undefined}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
        <div className="min-w-0 space-y-3">
          <div>
            <SubHeading>Signals</SubHeading>
            <SignalList signals={candidate.signals} today={today} />
          </div>
          {candidate.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidate.skills.map((s) => (
                <span key={s} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                  {s}
                </span>
              ))}
            </div>
          )}
          {(retention || candidate.consent) && (
            <div className="flex flex-wrap items-center gap-2">
              {retention && <RetentionBadge deleteOn={candidate.deleteOn} today={today} onHold={onHold} />}
              {candidate.consent && (
                <Badge tone="green" icon={ShieldCheck}>
                  Consented: {CONSENT_LABELS[candidate.consent]}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {open && <Explanation fit={candidate.fit} breakdown={candidate.breakdown} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Candidate Preview (free trial)                                      */
/* ------------------------------------------------------------------ */

export function CandidatePreviewResult({
  preview,
  fitThreshold,
  today,
  label,
  onLabel,
}: {
  preview: Preview;
  fitThreshold: number;
  today: ISODate;
  label: TestRunLabel | null;
  onLabel: (label: TestRunLabel) => void;
}) {
  const [open, setOpen] = useState(false);
  // Previews are scored once, when generated: compare with the Fit threshold of today's Niche Profile.
  const below = preview.fit < fitThreshold;
  const fit: Fit =
    preview.fitDetail.threshold === fitThreshold
      ? preview.fitDetail
      : { ...preview.fitDetail, threshold: fitThreshold, aboveThreshold: !below, summary: below ? `Below the Fit threshold (${fitThreshold})` : preview.fitDetail.summary };

  return (
    <article className={cardFrame(label)}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3 @md:flex-row @md:items-start @md:justify-between @md:gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PreviewAvatar />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{preview.summary}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-zinc-500">
              <Badge tone="neutral">Preview</Badge>
              {below && <BelowThresholdBadge />}
              <span>Anonymised and never stored until you buy Credits</span>
            </div>
          </div>
        </div>
        <LabelToggle value={label} onChange={onLabel} name="this Candidate Preview" />
      </div>
      <div className={CARD_BODY}>
        <ScoresColumn
          fit={preview.fit}
          fitThreshold={fitThreshold}
          signalStrength={preview.signalStrength}
          summary={below ? undefined : fit.summary}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
        <div className="min-w-0">
          <SubHeading>Signals</SubHeading>
          <PreviewSignalList preview={preview} today={today} />
        </div>
      </div>
      {open && <Explanation fit={fit} breakdown={preview.breakdown} />}
    </article>
  );
}

export function ResultSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3.5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-40 animate-pulse rounded bg-zinc-200/70" />
          <div className="h-3 w-72 max-w-full animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-md bg-zinc-100" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[208px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
