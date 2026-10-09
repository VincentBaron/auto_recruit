"use client";

// Side column of /niches/[id]: agents on / off, Test Run, schedule and per-run volumes, activity.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CalendarClock, Coins, FlaskConical, Lock, Pause, Play, Power, TriangleAlert } from "lucide-react";
import { formatCredits, formatCreditsLabel, formatDate, formatRelative, formatWeekdayDate, weekdayShort } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import { WEEKDAYS, type ClientState, type Niche, type NicheSchedule } from "@/lib/types";
import { PriceHint } from "@/components/ui/price-hint";
import { PAID_TEST_RUN_MAX } from "./next-test-run";
import { lastRunStop, nextRunOn, runCostEstimate, scheduleText } from "./options";
import { NicheStatusBadge } from "./shared";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, KeyValue, Spinner, cx, inputClass } from "./ui";

export function scheduleCost(s: NicheSchedule) {
  const run = runCostEstimate(s, { prospect: PRICES.surfacedProspect, candidate: PRICES.surfacedCandidate, hiringContact: PRICES.hiringContactFound });
  return { ...run, perWeek: run.total * s.days.length };
}

/* ------------------------------------------------------------------ */
/* Agents on / off                                                     */
/* ------------------------------------------------------------------ */

export function AgentsCard({
  niche,
  state,
  schedule,
  onActivate,
  onPause,
  busy,
}: {
  niche: Niche;
  state: ClientState;
  schedule: NicheSchedule;
  onActivate: () => void;
  onPause: () => void;
  busy: boolean;
}) {
  const free = state.derived.isFreeTrial;
  const next = niche.status === "active" ? nextRunOn(schedule, state.clock.today) : null;
  const text =
    niche.status === "active"
      ? `The Prospection and Sourcing Agents run ${scheduleText(schedule)}.`
      : niche.status === "paused"
        ? "Paused: the agents do not run and spend no Credits until you switch them on again."
        : niche.status === "testing"
          ? "The Test Run is done. Switch the agents on to run on the schedule below."
          : "The agents are off. Review the Niche Profile, then launch a Test Run.";
  return (
    <Card>
      <CardHeader title="Agents" icon={<Power />} actions={<NicheStatusBadge status={niche.status} />} />
      <CardBody className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-600">{text}</p>
        {next ? (
          <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600">
            <CalendarClock className="size-3.5 text-zinc-400" aria-hidden />
            Next run {formatWeekdayDate(next)} at {schedule.time}
          </div>
        ) : null}
        {niche.status === "active" ? (
          <Button onClick={onPause} loading={busy} className="w-full">
            <Pause aria-hidden />
            Pause agents
          </Button>
        ) : free ? (
          <div className="space-y-2">
            <Button disabled className="w-full">
              <Lock aria-hidden />
              Switch agents on
            </Button>
            <p className="text-xs text-zinc-500">
              The free trial shows a Test Run only.{" "}
              <Link href="/credits" className="font-medium text-indigo-600 hover:text-indigo-500">
                Buy Credits to reveal people and switch agents on
              </Link>
            </p>
          </div>
        ) : (
          <Button variant="primary" onClick={onActivate} loading={busy} disabled={!niche.setupComplete} className="w-full">
            <Play aria-hidden />
            {niche.status === "paused" ? "Switch agents on again" : "Switch agents on"}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Test Run                                                            */
/* ------------------------------------------------------------------ */

export function TestRunCard({
  niche,
  state,
  onLaunchFree,
  onLaunchPaid,
  launching,
  blocked,
}: {
  niche: Niche;
  state: ClientState;
  onLaunchFree: () => void;
  onLaunchPaid: () => void;
  launching: boolean;
  /** Reason the profile is not ready for a Test Run (validation), or null. */
  blocked: string | null;
}) {
  const tr = niche.testRun;
  const ws = state.workspace;
  const free = state.derived.isFreeTrial;
  const freeAvailable = state.derived.freeTestRunAvailable;
  const domain = ws?.mainDomains[0] ?? "your domain";

  let body: ReactNode;
  if (tr?.status === "running") {
    const current = tr.steps.find((s) => s.status === "running") ?? tr.steps[tr.steps.length - 1];
    body = (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <Spinner className="text-indigo-600" />
          {current?.label ?? "Running"}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${Math.round(tr.progress * 100)}%` }} />
        </div>
        <ButtonLink href={`/niches/${niche.id}/test-run`} variant="primary" className="w-full">
          Watch it live
          <ArrowRight aria-hidden />
        </ButtonLink>
      </div>
    );
  } else if (tr) {
    const prospects = tr.items.filter((i) => i.kind === "prospect").length;
    const candidates = tr.items.filter((i) => i.kind === "candidate").length;
    const labelled = tr.items.filter((i) => i.label !== null).length;
    const proposed = tr.adjustments.filter((a) => a.status === "proposed").length;
    const previews = tr.items.some((i) => i.previewId !== null);
    body = (
      <div className="space-y-3">
        <dl className="divide-y divide-zinc-100">
          <KeyValue label="Run on" value={formatDate(tr.completedOn ?? tr.startedOn)} />
          <KeyValue label="Prospects" value={prospects} />
          <KeyValue label={previews ? "Candidates (Previews)" : "Candidates"} value={candidates} />
          <KeyValue label="Labelled good / bad" value={`${labelled} of ${tr.items.length}`} />
          <KeyValue label="Adjustments to review" value={proposed} />
          <KeyValue label="Credits charged" value={tr.free ? "0 (free)" : formatCredits(tr.creditsCharged)} />
        </dl>
        <ButtonLink href={`/niches/${niche.id}/test-run`} variant={free || labelled < tr.items.length ? "primary" : "secondary"} className="w-full">
          Open Test Run results
          <ArrowRight aria-hidden />
        </ButtonLink>
        {free ? (
          <ButtonLink href="/credits" className="w-full">
            <Coins aria-hidden />
            Buy Credits to reveal people
          </ButtonLink>
        ) : (
          <Button onClick={onLaunchPaid} loading={launching} disabled={blocked !== null} className="w-full">
            <FlaskConical aria-hidden />
            Run another Test Run · up to {PAID_TEST_RUN_MAX} Credits
          </Button>
        )}
      </div>
    );
  } else if (free && freeAvailable) {
    body = (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-600">
          10 Prospects in full with their Signals and Detected Roles, Hiring Contacts and Candidates as Previews. Label them good or bad to tune this Niche Profile.
        </p>
        <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-xs leading-relaxed text-emerald-900">
          <div className="font-medium">0 Credits, no card</div>
          <div className="[overflow-wrap:anywhere]">
            Once per Main Domain: <span className="font-medium">{domain}</span>
          </div>
        </div>
        <Button variant="primary" onClick={onLaunchFree} loading={launching} disabled={blocked !== null} className="w-full">
          <FlaskConical aria-hidden />
          Launch free Test Run
        </Button>
        {blocked ? <p className="text-xs text-amber-700">{blocked}</p> : null}
      </div>
    );
  } else if (free) {
    body = (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-900">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {ws?.freeTestRunUsedBy ?? domain} already used its free Test Run. Free Test Runs are limited to one per Main Domain.
          </span>
        </div>
        <ButtonLink href="/credits" variant="primary" className="w-full">
          <Coins aria-hidden />
          Buy Credits to run a Test Run
        </ButtonLink>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-600">
          A small run to check this Niche Profile before switching the agents on: 10 Prospects and 10 Candidates for you to label good or bad.
        </p>
        <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-100 px-2.5">
          <KeyValue label="10 Prospects" value={`${10 * PRICES.surfacedProspect} Credits`} />
          <KeyValue label="10 Candidates" value={`${10 * PRICES.surfacedCandidate} Credits`} />
          <KeyValue label="Hiring Contacts found" value={`up to ${10 * 2 * PRICES.hiringContactFound}`} />
          <KeyValue label="Total, at most" value={`${PAID_TEST_RUN_MAX} Credits`} strong />
        </dl>
        <Button variant="primary" onClick={onLaunchPaid} loading={launching} disabled={blocked !== null} className="w-full">
          <FlaskConical aria-hidden />
          Launch Test Run
        </Button>
        {blocked ? <p className="text-xs text-amber-700">{blocked}</p> : null}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Test Run"
        icon={<FlaskConical />}
        actions={
          tr?.status === "running" ? (
            <Badge tone="sky" dot>
              Running
            </Badge>
          ) : tr ? (
            <Badge tone="emerald">Done</Badge>
          ) : free && freeAvailable ? (
            <Badge tone="indigo">Free</Badge>
          ) : null
        }
      />
      <CardBody>{body}</CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule and per-run volumes                                        */
/* ------------------------------------------------------------------ */

export function ScheduleCard({ schedule, onChange }: { schedule: NicheSchedule; onChange: (s: NicheSchedule) => void }) {
  const cost = scheduleCost(schedule);
  const setNum = (key: "prospectsPerRun" | "candidatesPerRun", raw: string) => {
    if (raw === "") return;
    const n = Math.max(0, Math.min(200, Math.round(Number(raw))));
    if (!Number.isNaN(n)) onChange({ ...schedule, [key]: n });
  };
  return (
    // id="schedule": the Test Run screen links to /niches/<id>#schedule.
    <Card id="schedule" className="scroll-mt-[calc(var(--chrome-h)+1rem)]">
      <CardHeader title="Schedule and volumes" icon={<CalendarClock />} description="When the agents run and how many items each run may surface." />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-zinc-700">Days</div>
          <div role="group" aria-label="Run days" className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => {
              const on = schedule.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...schedule, days: on ? schedule.days.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || schedule.days.includes(x)) })}
                  className={cx(
                    "h-8 rounded-md border text-xs font-medium transition-colors",
                    on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300",
                  )}
                >
                  {weekdayShort(d).slice(0, 2)}
                </button>
              );
            })}
          </div>
        </div>
        {/* The time input needs about 6.5rem for "07:00" and the picker icon; the counts need less. */}
        <div className="grid grid-cols-[minmax(6.5rem,1.3fr)_1fr_1fr] gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Time</span>
            <input type="time" value={schedule.time} onChange={(e) => e.target.value && onChange({ ...schedule, time: e.target.value })} className={cx(inputClass, "tabular-nums")} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Prospects</span>
            <input type="number" min={0} max={200} value={schedule.prospectsPerRun} onChange={(e) => setNum("prospectsPerRun", e.target.value)} className={cx(inputClass, "text-right tabular-nums")} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Candidates</span>
            <input type="number" min={0} max={200} value={schedule.candidatesPerRun} onChange={(e) => setNum("candidatesPerRun", e.target.value)} className={cx(inputClass, "text-right tabular-nums")} />
          </label>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-700">Maximum Credits</span>
            <PriceHint />
          </div>
          <dl className="divide-y divide-zinc-200/70">
            <KeyValue label={`${schedule.prospectsPerRun} Prospects x ${PRICES.surfacedProspect}`} value={formatCredits(cost.prospects)} />
            <KeyValue label={`Hiring Contacts, up to 3 per Prospect x ${PRICES.hiringContactFound}`} value={formatCredits(cost.hiringContacts)} />
            <KeyValue label={`${schedule.candidatesPerRun} Candidates x ${PRICES.surfacedCandidate}`} value={formatCredits(cost.candidates)} />
            <KeyValue label="Per run, at most" value={formatCredits(cost.total)} strong />
            <KeyValue label={`Per week, ${schedule.days.length} ${schedule.days.length === 1 ? "run" : "runs"}`} value={formatCredits(cost.perWeek)} strong />
          </dl>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">Only items above the Fit threshold are Surfaced and charged. Runs stop cleanly when Credits run out.</p>
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export function ActivityCard({ niche, state }: { niche: Niche; state: ClientState }) {
  const today = state.clock.today;
  const used = state.derived.creditsUsedLast7DaysByNiche[niche.id] ?? 0;
  const prospects = state.prospects.filter((p) => p.nicheIds.includes(niche.id) && p.status === "surfaced").length;
  const candidates = state.candidates.filter((c) => c.nicheIds.includes(niche.id) && c.lifecycle === "surfaced").length;
  const runs = state.agentRuns
    .filter((r) => r.nicheId === niche.id)
    .slice(-5)
    .reverse();
  const stop = lastRunStop(state.agentRuns, niche.id);
  const kindLabel: Record<string, string> = {
    scheduled: "Scheduled run",
    manual: "Manual run",
    test_run: "Test Run",
    role_sourcing: "Sourcing for a Detected Role",
    find_more: "Find more like",
  };
  return (
    <Card>
      <CardHeader title="Activity" icon={<Coins />} />
      <CardBody className="space-y-3">
        <dl className="divide-y divide-zinc-100">
          <KeyValue label="Credits used, last 7 days" value={formatCredits(used)} strong />
          <KeyValue label="Last run" value={niche.lastRunOn ? formatRelative(niche.lastRunOn, today) : "Never"} />
          {stop ? (
            <div className="py-1.5">
              <dt className="sr-only">Last run status</dt>
              <dd className="flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-2 text-xs leading-relaxed text-red-800">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium">Last run stopped: {stop.reason}</span>
                  {stop.credits ? (
                    <>
                      {" "}
                      <Link href="/credits" className="whitespace-nowrap font-medium text-indigo-600 hover:text-indigo-500">
                        Buy Credits
                      </Link>
                    </>
                  ) : null}
                </span>
              </dd>
            </div>
          ) : null}
          <KeyValue label="Surfaced Prospects in the Feed" value={prospects} />
          <KeyValue label="Surfaced Candidates in the Feed" value={candidates} />
          <KeyValue label="Created" value={formatDate(niche.createdOn)} />
          {niche.activatedOn ? <KeyValue label="Agents first switched on" value={formatDate(niche.activatedOn)} /> : null}
        </dl>
        {runs.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Recent runs</div>
            <ul className="space-y-1.5">
              {runs.map((r) => (
                <li key={r.id} className="rounded-md border border-zinc-100 px-2.5 py-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-zinc-800">{kindLabel[r.kind] ?? r.kind}</span>
                      <span className="text-zinc-400"> · {formatRelative(r.on, today)}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-zinc-700">{formatCreditsLabel(r.creditsSpent)}</span>
                  </div>
                  <div className="mt-0.5 tabular-nums text-zinc-500">
                    {r.prospectsSurfaced} Prospects · {r.candidatesSurfaced} Candidates · {r.hiringContactsFound} Hiring Contacts
                  </div>
                  {r.stoppedReason ? <div className="mt-0.5 text-red-600">Stopped: {r.stoppedReason}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {niche.status === "active" || niche.status === "paused" ? (
          <ButtonLink href={`/feed?niche=${niche.id}`} size="sm" className="w-full">
            Open this Niche in the Feed
            <ArrowRight aria-hidden />
          </ButtonLink>
        ) : null}
      </CardBody>
    </Card>
  );
}
