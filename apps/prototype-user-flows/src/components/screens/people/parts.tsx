"use client";

// Domain display pieces shared by the Prospect and Candidate detail screens: Claim and status
// badges, contact values with Provenance, the Signal Strength breakdown, Fit reasons, Signals timeline.
// Lifecycle, retention and Fit use the shared person badges so they look the same on every page.

import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { formatDate, formatRelative, formatScore } from "@/lib/format";
import {
  CONTACT_KIND_LABELS,
  METHOD_LABELS,
  PROSPECT_STATUS_LABELS,
  PROVIDER_LABELS,
  SIGNAL_TYPE_LABELS,
  VERIFICATION_LABELS,
} from "@/lib/labels";
import type {
  AuditEvent,
  Claim,
  ClientState,
  ContactValue,
  Fit,
  ISODate,
  ProspectStatus,
  Signal,
  SignalBreakdown,
  Verification,
} from "@/lib/types";
import Link from "next/link";
import type { ActivityItem } from "./derive";
import { campaignName, currentRecruiterId, nicheName, recruiterName } from "./derive";
import { Badge, Button, Dot, ExtLink, Meter, Tabs, cx, displayUrl, type Tone } from "./ui";

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export { LifecycleBadge } from "@/components/domain/person-badges";

/** Same tones as the shared lifecycle badge: Surfaced grey, in a Campaign indigo, Replied sky. */
const PROSPECT_STATUS_TONES: Record<ProspectStatus, Tone> = {
  surfaced: "neutral",
  dismissed: "neutral",
  in_campaign: "indigo",
  replied: "sky",
  closed: "amber",
};

export function ProspectStatusBadge({ status, closedUntil }: { status: ProspectStatus; closedUntil: ISODate | null }) {
  return (
    <Badge tone={PROSPECT_STATUS_TONES[status]}>
      {status === "closed" && closedUntil ? `Closed until ${formatDate(closedUntil)}` : PROSPECT_STATUS_LABELS[status]}
    </Badge>
  );
}

const VERIFICATION_TONES: Record<Verification, Tone> = {
  valid: "green",
  catch_all: "amber",
  invalid: "red",
  unverified: "neutral",
};

export function VerificationBadge({ verification }: { verification: Verification }) {
  return <Badge tone={VERIFICATION_TONES[verification]}>{VERIFICATION_LABELS[verification]}</Badge>;
}

export function ClaimBadge({ state, claim }: { state: ClientState; claim: Claim | null }) {
  if (!claim) return null;
  const mine = claim.recruiterId === currentRecruiterId(state);
  return (
    <Badge
      tone={mine ? "indigo" : "amber"}
      icon={<Lock />}
      title={`Claim taken ${formatDate(claim.since)} in ${campaignName(state, claim.campaignId)}, lapses ${formatDate(claim.expiresOn)}`}
    >
      {mine ? "Claimed by you" : `Claimed by ${recruiterName(state, claim.recruiterId)}`}
    </Badge>
  );
}

/** A Niche the record belongs to, linking to its Niche Profile. */
export function NicheChip({ state, nicheId }: { state: ClientState; nicheId: string }) {
  const name = nicheName(state, nicheId);
  return (
    <Link
      href={`/niches/${nicheId}`}
      title={name}
      className="inline-flex h-5 max-w-full min-w-0 items-center rounded-md bg-white px-1.5 text-xs text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
    >
      <span className="truncate">{name}</span>
    </Link>
  );
}

export function NewSignalBadge() {
  return (
    <Badge tone="indigo" icon={<Sparkles />}>
      New Signal
    </Badge>
  );
}

/** "Signal Strength 78" chip with a tiny bar, for compact rows. */
export function ScoreChip({ label, value, threshold }: { label: string; value: number; threshold?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" title={threshold !== undefined ? `${label} ${value}, threshold ${threshold}` : `${label} ${value}`}>
      <span>{label}</span>
      <span className="font-semibold text-zinc-900 tabular-nums">{formatScore(value)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Contact values with Provenance (ADR-0005)                           */
/* ------------------------------------------------------------------ */

export function ContactValueList({ values }: { values: ContactValue[] }) {
  const ordered = [...values].sort((a, b) => (a.kind === "mobile" ? 1 : 0) - (b.kind === "mobile" ? 1 : 0));
  return (
    <ul className="divide-y divide-zinc-100">
      {ordered.map((v) => (
        <li key={v.id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {v.kind === "mobile" ? <Phone className="size-3.5 shrink-0 text-zinc-400" /> : <Mail className="size-3.5 shrink-0 text-zinc-400" />}
            <span className={cx("min-w-0 break-all font-mono text-[13px]", v.verification === "invalid" ? "text-zinc-400 line-through" : "text-zinc-900")}>
              {v.value}
            </span>
            <span className="text-xs text-zinc-500">{CONTACT_KIND_LABELS[v.kind]}</span>
            <VerificationBadge verification={v.verification} />
            {v.creditsCharged > 0 && (
              <span className="text-xs text-zinc-400 tabular-nums">
                {v.creditsCharged} Credit{v.creditsCharged === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[22px] text-xs text-zinc-500">
            <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" />
            <span className="font-medium text-zinc-700">Provenance</span>
            <span>{PROVIDER_LABELS[v.provenance.provider]}</span>
            <Dot />
            <span>{METHOD_LABELS[v.provenance.method]}</span>
            <Dot />
            <span className="whitespace-nowrap">found {formatDate(v.provenance.foundOn)}</span>
            <span className="flex min-w-0 basis-full">
              <ExtLink href={v.provenance.sourceUrl} className="max-w-full">
                {displayUrl(v.provenance.sourceUrl)}
              </ExtLink>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Signal Strength breakdown (ADR-0006)                                */
/* ------------------------------------------------------------------ */

function signed(n: number, digits = 0): string {
  const v = digits > 0 ? Math.abs(n).toFixed(digits) : String(Math.abs(Math.round(n)));
  if (n > 0) return `+${v}`;
  if (n < 0) return `-${v}`;
  return digits > 0 ? (0).toFixed(digits) : "0";
}

export function BreakdownTable({ breakdown, today }: { breakdown: SignalBreakdown; today: ISODate }) {
  if (breakdown.lines.length === 0) {
    return <p className="py-2 text-[13px] text-zinc-500">No Signals yet, so the Signal Strength is 0.</p>;
  }
  return (
    <div>
      <div className="-mx-4">
        {/* Phones: one stacked line per Signal, then the arithmetic. */}
        <ul className="divide-y divide-zinc-100 sm:hidden">
          {breakdown.lines.map((l) => (
            <li key={l.signalId} className="px-4 py-2.5 first:pt-0">
              <p className={cx("text-[13px] font-medium", l.enabled ? "text-zinc-900" : "text-zinc-400 line-through")}>{l.label}</p>
              <p className="text-xs text-zinc-500">
                {SIGNAL_TYPE_LABELS[l.type]} <Dot /> {formatDate(l.date)} ({formatRelative(l.date, today)})
              </p>
              <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                <span className={cx(l.negative ? "text-rose-600" : "text-zinc-700")}>{signed(l.points)} points</span> x {l.decay.toFixed(2)} decay ={" "}
                <span className={cx("font-semibold", !l.enabled ? "text-zinc-400" : l.contribution < 0 ? "text-rose-600" : "text-zinc-900")}>
                  {signed(l.contribution, 1)}
                </span>
              </p>
              {!l.enabled && <p className="text-xs text-amber-700">Weight switched off in the Niche Profile</p>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-fixed text-[13px] tabular-nums">
            <thead>
              <tr className="whitespace-nowrap border-b border-zinc-100 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <th className="py-2 pl-4 pr-2 font-medium">Signal</th>
                <th className="w-14 px-2 py-2 text-right font-medium">Age</th>
                <th className="w-16 px-2 py-2 text-right font-medium">Points</th>
                <th className="hidden w-[84px] px-2 py-2 text-right font-medium md:table-cell">Half-life</th>
                <th className="w-16 px-2 py-2 text-right font-medium">Decay</th>
                <th className="w-20 py-2 pl-2 pr-4 text-right font-medium">Counts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {breakdown.lines.map((l) => (
                <tr key={l.signalId} className={cx(!l.enabled && "text-zinc-400")}>
                  <td className="py-2 pl-4 pr-2 align-top">
                    <div className={cx("truncate font-medium", l.enabled ? "text-zinc-900" : "text-zinc-400 line-through")} title={l.label}>
                      {l.label}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {SIGNAL_TYPE_LABELS[l.type]} <Dot /> {formatDate(l.date)}
                      {!l.enabled && <span className="text-amber-700"> - weight switched off in the Niche Profile</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top text-zinc-600">{l.ageDays} d</td>
                  <td className={cx("whitespace-nowrap px-2 py-2 text-right align-top", l.negative ? "text-rose-600" : "text-zinc-600")}>{signed(l.points)}</td>
                  <td className="hidden whitespace-nowrap px-2 py-2 text-right align-top text-zinc-600 md:table-cell">{l.halfLifeDays} d</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top text-zinc-600">x {l.decay.toFixed(2)}</td>
                  <td
                    className={cx(
                      "whitespace-nowrap py-2 pl-2 pr-4 text-right align-top font-semibold",
                      !l.enabled ? "text-zinc-400" : l.contribution < 0 ? "text-rose-600" : "text-zinc-900",
                    )}
                  >
                    {signed(l.contribution, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-2 text-[13px] tabular-nums">
          <span className="text-zinc-500">
            Sum of {breakdown.lines.length} Signal{breakdown.lines.length === 1 ? "" : "s"}
          </span>
          <span className="text-zinc-700">{signed(breakdown.rawTotal, 1)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 bg-zinc-50 px-4 py-2 text-[13px] tabular-nums">
          <span className="font-medium text-zinc-900">Signal Strength (clamped to 0-100)</span>
          <span className="text-base font-semibold text-zinc-900">{breakdown.total}</span>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        {breakdown.formula || "Sum of points x 0.5^(age in days / half-life), clamped to 0-100"}. Each Signal fades by half every half-life, so the timing explanation stays honest as
        days pass.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fit                                                                 */
/* ------------------------------------------------------------------ */

export function FitPanel({ fit }: { fit: Fit }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{fit.score}</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
        <span className={cx("text-xs tabular-nums", fit.aboveThreshold ? "text-zinc-500" : "font-medium text-amber-700")}>
          {fit.aboveThreshold ? "Above" : "Below"} the Fit threshold of {fit.threshold}
        </span>
      </div>
      <div className="mt-2">
        <Meter value={fit.score} threshold={fit.threshold} />
      </div>
      {fit.summary && <p className="mt-2.5 text-[13px] text-zinc-700">{fit.summary}</p>}
      <ul className="mt-3 space-y-2">
        {fit.reasons.map((r) => {
          const Icon = r.matched === "yes" ? CircleCheck : r.matched === "partial" ? CircleMinus : CircleX;
          return (
            <li key={r.label} className="flex items-start gap-2 text-[13px]">
              <Icon
                className={cx(
                  "mt-0.5 size-4 shrink-0",
                  r.matched === "yes" ? "text-emerald-600" : r.matched === "partial" ? "text-amber-500" : "text-zinc-300",
                )}
              />
              <span className="min-w-0 flex-1 text-zinc-700">{r.label}</span>
              <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                {r.points}/{r.maxPoints}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Fit is how closely this matches the Niche Profile, regardless of timing.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signals timeline                                                    */
/* ------------------------------------------------------------------ */

export function SignalsTimeline({
  signals,
  breakdown,
  today,
  newSignalId,
}: {
  signals: Signal[];
  breakdown: SignalBreakdown;
  today: ISODate;
  newSignalId?: string | null;
}) {
  const ordered = [...signals].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const contribution = new Map(breakdown.lines.map((l) => [l.signalId, l]));
  return (
    <ol className="relative ml-1.5 border-l border-zinc-200">
      {ordered.map((s) => {
        const line = contribution.get(s.id);
        const negative = s.points < 0;
        return (
          <li key={s.id} className="relative pb-4 pl-5 last:pb-0">
            <span
              className={cx(
                "absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-white",
                negative ? "bg-rose-500" : s.id === newSignalId ? "bg-indigo-500" : "bg-zinc-400",
              )}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={negative ? "red" : "neutral"}>{SIGNAL_TYPE_LABELS[s.type]}</Badge>
                  {s.id === newSignalId && <NewSignalBadge />}
                  <span className="text-xs text-zinc-500">
                    {formatDate(s.date)} <Dot /> {formatRelative(s.date, today)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-zinc-900">{s.label}</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-zinc-500">
                  <span className="shrink-0">Evidence:</span>
                  <ExtLink href={s.evidenceUrl} className="max-w-full">
                    {s.source || displayUrl(s.evidenceUrl)}
                  </ExtLink>
                </p>
              </div>
              {line && (
                <div className="shrink-0 text-right">
                  <div
                    className={cx(
                      "text-[13px] font-semibold tabular-nums",
                      !line.enabled ? "text-zinc-400 line-through" : line.contribution < 0 ? "text-rose-600" : "text-zinc-900",
                    )}
                  >
                    {signed(line.contribution, 1)}
                  </div>
                  <div className="text-[11px] text-zinc-400 tabular-nums">
                    of {signed(line.points)} pts
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Activity and audit trail                                            */
/* ------------------------------------------------------------------ */

const ACTIVITY_DOT: Record<ActivityItem["kind"], string> = {
  surfaced: "bg-sky-500",
  enriched: "bg-violet-500",
  campaign: "bg-indigo-500",
  email: "bg-indigo-400",
  reply: "bg-emerald-500",
  response: "bg-emerald-400",
  consent: "bg-emerald-600",
  role: "bg-zinc-400",
  closed: "bg-amber-500",
  data_request: "bg-amber-500",
};

const INITIAL_ROWS = 8;

export function ActivityPanel({ activity, audit, today }: { activity: ActivityItem[]; audit: AuditEvent[]; today: ISODate }) {
  const [tab, setTab] = useState<"activity" | "audit">("activity");
  const [expanded, setExpanded] = useState(false);
  const rows = tab === "activity" ? activity.length : audit.length;
  const limit = expanded ? rows : INITIAL_ROWS;
  return (
    <div>
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setExpanded(false);
        }}
        options={[
          { value: "activity", label: "Activity", count: activity.length },
          { value: "audit", label: "Audit trail", count: audit.length },
        ]}
      />
      {tab === "activity" ? (
        activity.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">No activity yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {activity.slice(0, limit).map((a) => (
              <li key={a.key} className="flex gap-2.5">
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", ACTIVITY_DOT[a.kind])} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-5 text-zinc-800">
                    {a.href ? (
                      <Link href={a.href} className="hover:text-indigo-600">
                        {a.text}
                      </Link>
                    ) : (
                      a.text
                    )}
                  </p>
                  {a.detail && <p className="truncate text-xs text-zinc-500" title={a.detail}>{a.detail}</p>}
                  <p className="text-[11px] text-zinc-400">
                    {formatDate(a.on)} <Dot /> {formatRelative(a.on, today)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : audit.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">No audit events mention this record yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-zinc-100">
          {audit.slice(0, limit).map((e) => (
            <li key={e.id} className="py-2 first:pt-0">
              <p className="text-[13px] leading-5 text-zinc-800">
                <span className="font-medium text-zinc-900">{e.actor}</span> <span className="text-zinc-600">{e.action}</span>
              </p>
              <p className="truncate text-xs text-zinc-500" title={e.target}>
                {e.target}
              </p>
              <p className="text-[11px] text-zinc-400 tabular-nums">
                {formatDate(e.on)} <Dot /> #{e.seq}
              </p>
            </li>
          ))}
        </ol>
      )}
      {rows > INITIAL_ROWS && (
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show all ${rows}`}
        </Button>
      )}
    </div>
  );
}
