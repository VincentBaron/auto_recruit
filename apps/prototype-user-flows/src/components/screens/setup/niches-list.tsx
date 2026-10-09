"use client";

// /niches: every Niche of the Workspace with status, schedule, last run, per-run volumes and
// Credits used over the last 7 days.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FlaskConical, Plus, Target } from "lucide-react";
import { formatCredits, formatRelative, formatWeekdayDate, formatWeekdays } from "@/lib/format";
import type { ClientState, Niche } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { TestRunNextStep, nextTestRun } from "./next-test-run";
import { lastRunStop, nextRunOn, profileSummary, scheduleText } from "./options";
import { NicheStatusBadge, NotSignedIn, PageSkeleton } from "./shared";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Spinner, cx } from "./ui";

type Filter = "all" | "mine";

const TITLE = "Niches";
const DESCRIPTION =
  "Each Niche is owned by one Recruiter. Its agents run on the Niche's schedule and spend Credits per Surfaced Prospect, Candidate and Hiring Contact.";

function rowAction(niche: Niche): { href: string; label: string } | null {
  if (niche.status === "draft" && !niche.setupComplete) return { href: `/onboarding/niche?niche=${niche.id}`, label: "Continue setup" };
  if (niche.testRun?.status === "running") return { href: `/niches/${niche.id}/test-run`, label: "Watch Test Run" };
  if (niche.status === "testing" && niche.testRun) return { href: `/niches/${niche.id}/test-run`, label: "Test Run results" };
  return null;
}

/** Under the last run date: why it stopped ("Credits ran out"), with "Buy Credits" when Credits stopped it. */
function LastRunStop({ niche, state }: { niche: Niche; state: ClientState }) {
  const stop = lastRunStop(state.agentRuns, niche.id);
  if (!stop) return null;
  return (
    <div className="mt-0.5 text-xs leading-snug">
      <div className="font-medium text-red-700" title={`Last run stopped: ${stop.reason}`}>
        <span className="sr-only">Last run stopped: </span>
        {stop.reason}
      </div>
      {stop.credits ? (
        <Link href="/credits" onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-medium text-indigo-600 hover:text-indigo-500">
          Buy Credits
        </Link>
      ) : null}
    </div>
  );
}

function RunState({ niche, state }: { niche: Niche; state: ClientState }) {
  const tr = niche.testRun;
  if (tr?.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-sky-700">
        <Spinner className="size-3 text-sky-600" />
        Test Run {Math.round(tr.progress * 100)}%
      </span>
    );
  }
  if (niche.status === "draft" && niche.setupComplete && nextTestRun(state).free) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-600">
        <FlaskConical className="size-3" aria-hidden />
        Free Test Run available
      </span>
    );
  }
  if (niche.status === "draft" && !niche.setupComplete) return <span className="text-xs text-zinc-500">Setup in progress</span>;
  return null;
}

export function NichesList() {
  const state = useAppState();
  const backendError = useBackendError();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  if (state === null) return backendError ? <BackendErrorState error={backendError} /> : <PageSkeleton variant="list" />;
  if (!state.session.signedIn || !state.workspace) return <NotSignedIn title={TITLE} description={DESCRIPTION} what="set up your Niches" />;

  const today = state.clock.today;
  const me = state.derived.currentRecruiter;
  const nameOf = (id: string) => state.recruiters.find((r) => r.id === id)?.name ?? "Unknown Recruiter";
  const used = state.derived.creditsUsedLast7DaysByNiche;
  const niches = state.niches.filter((n) => filter === "all" || n.ownerId === me?.id);
  const mineCount = state.niches.filter((n) => n.ownerId === me?.id).length;
  const active = state.niches.filter((n) => n.status === "active");
  const totalUsed = state.niches.reduce((sum, n) => sum + (used[n.id] ?? 0), 0);
  const nextRuns = active
    .map((n) => ({ n, on: nextRunOn(n.schedule, today) }))
    .filter((x): x is { n: Niche; on: string } => x.on !== null)
    .sort((a, b) => (a.on !== b.on ? (a.on < b.on ? -1 : 1) : a.n.schedule.time < b.n.schedule.time ? -1 : a.n.schedule.time > b.n.schedule.time ? 1 : 0));
  const next = nextRuns[0] ?? null;
  const feedCount = (n: Niche) => ({
    prospects: state.prospects.filter((p) => p.nicheIds.includes(n.id) && p.status === "surfaced").length,
    candidates: state.candidates.filter((c) => c.nicheIds.includes(n.id) && c.lifecycle === "surfaced").length,
  });

  return (
    <PageContainer>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <ButtonLink href="/onboarding/niche" variant="primary">
            <Plus aria-hidden />
            New Niche
          </ButtonLink>
        }
      />

      {state.niches.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No Niches yet"
          description={
            <>
              Describe the placements you make and the setup agent drafts your first Niche Profile. Then <TestRunNextStep next={nextTestRun(state)} />
            </>
          }
          actions={
            <ButtonLink href="/onboarding/niche" variant="primary">
              <Plus aria-hidden />
              Set up a Niche
            </ButtonLink>
          }
        />
      ) : (
        <>
          <StatGrid className="mb-6">
            <StatTile label="Active Niches" value={`${active.length} of ${state.niches.length}`} hint={`${state.niches.length - active.length} draft, testing or paused`} />
            <StatTile label="Credits used, last 7 days" value={formatCredits(totalUsed)} hint="Across all Niches" />
            <StatTile
              label="Credits balance"
              value={formatCredits(state.workspace.credits)}
              hint={state.derived.isFreeTrial ? "Free trial" : state.workspace.autoTopUp.enabled ? "Auto top-up on" : "Auto top-up off"}
            />
            <StatTile
              label="Next scheduled run"
              value={next ? formatWeekdayDate(next.on).replace(/ \d{4}$/, "") : "-"}
              hint={next ? `${next.n.schedule.time} · ${next.n.name}` : "No active Niche"}
            />
          </StatGrid>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Filter Niches" className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-xs">
              {(
                [
                  ["all", `All (${state.niches.length})`],
                  ["mine", `Mine (${mineCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={cx(
                    "h-7 whitespace-nowrap rounded-md px-3 text-xs font-medium tabular-nums transition-colors",
                    filter === key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="hidden text-xs text-zinc-500 sm:inline">Agents run when the day advances onto a scheduled weekday.</span>
          </div>

          {niches.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title="You own no Niche yet"
              description="Niches owned by other Recruiters are under All."
              actions={
                <ButtonLink href="/onboarding/niche" variant="primary">
                  <Plus aria-hidden />
                  Set up a Niche
                </ButtonLink>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden md:block">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs font-medium text-zinc-500">
                      <th className="w-[33%] px-4 py-2.5 font-medium">Niche</th>
                      <th className="w-[12%] px-3 py-2.5 font-medium">Status</th>
                      <th className="w-[18%] px-3 py-2.5 font-medium">Schedule</th>
                      <th className="w-[12%] px-3 py-2.5 font-medium">Last run</th>
                      <th className="w-[12%] px-3 py-2.5 text-right font-medium">Per run</th>
                      <th className="w-[10%] whitespace-nowrap px-3 py-2.5 text-right font-medium">Credits, 7 days</th>
                      <th className="w-[3%] py-2.5 pr-3" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {niches.map((n) => {
                      const action = rowAction(n);
                      const fc = feedCount(n);
                      const nextOn = n.status === "active" ? nextRunOn(n.schedule, today) : null;
                      return (
                        <tr key={n.id} className="group cursor-pointer align-top transition-colors hover:bg-zinc-50/80" onClick={() => router.push(`/niches/${n.id}`)}>
                          <td className="px-4 py-3">
                            <Link href={`/niches/${n.id}`} className="block font-medium text-zinc-900 [overflow-wrap:anywhere] hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                              {n.name || "Untitled Niche"}
                            </Link>
                            <div className="mt-0.5 truncate text-xs text-zinc-500" title={profileSummary(n.profile)}>
                              {profileSummary(n.profile)}
                            </div>
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
                              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                                <Avatar name={nameOf(n.ownerId)} size="xs" />
                                {nameOf(n.ownerId)}
                              </span>
                              {n.status === "active" || n.status === "paused" ? (
                                <span
                                  className="min-w-0 truncate tabular-nums text-zinc-400"
                                  title={`${fc.prospects} Prospects, ${fc.candidates} Candidates Surfaced`}
                                >
                                  · {fc.prospects} Prospects, {fc.candidates} Candidates Surfaced
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-start gap-1.5">
                              <NicheStatusBadge status={n.status} />
                              <RunState niche={n} state={state} />
                              {action ? (
                                <Link
                                  href={action.href}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                  {action.label}
                                </Link>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-zinc-700">
                            <div className="truncate">
                              {formatWeekdays(n.schedule.days)} <span className="text-zinc-400">at</span> <span className="tabular-nums">{n.schedule.time}</span>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-zinc-500">
                              {nextOn ? `Next ${formatWeekdayDate(nextOn).replace(/ \d{4}$/, "")}` : n.status === "active" ? "No day selected" : "Not running"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-zinc-700">
                            {n.lastRunOn ? formatRelative(n.lastRunOn, today) : <span className="text-zinc-400">Never</span>}
                            <LastRunStop niche={n} state={state} />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-zinc-700">
                            <div>{n.schedule.prospectsPerRun} Prospects</div>
                            <div className="text-xs text-zinc-500">{n.schedule.candidatesPerRun} Candidates</div>
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-zinc-900">{formatCredits(used[n.id] ?? 0)}</td>
                          <td className="py-3 pr-3 text-right">
                            <ChevronRight className="ml-auto size-4 text-zinc-300 group-hover:text-zinc-500" aria-hidden />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {niches.map((n) => {
                  const action = rowAction(n);
                  return (
                    <li key={n.id}>
                      <Card className="px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/niches/${n.id}`} className="min-w-0 font-medium text-zinc-900 [overflow-wrap:anywhere] hover:text-indigo-600">
                            {n.name || "Untitled Niche"}
                          </Link>
                          <NicheStatusBadge status={n.status} />
                        </div>
                        <div className="mt-1 text-xs text-zinc-500 [overflow-wrap:anywhere]">{profileSummary(n.profile)}</div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                          <div>
                            <dt className="text-zinc-500">Owner</dt>
                            <dd className="truncate text-zinc-800">{nameOf(n.ownerId)}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Schedule</dt>
                            <dd className="truncate text-zinc-800">{scheduleText(n.schedule)}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Last run</dt>
                            <dd className="text-zinc-800">
                              {n.lastRunOn ? formatRelative(n.lastRunOn, today) : "Never"}
                              <LastRunStop niche={n} state={state} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Per run</dt>
                            <dd className="tabular-nums text-zinc-800">
                              {n.schedule.prospectsPerRun} P · {n.schedule.candidatesPerRun} C
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Credits, 7 days</dt>
                            <dd className="font-medium tabular-nums text-zinc-900">{formatCredits(used[n.id] ?? 0)}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Agents</dt>
                            <dd>
                              <RunState niche={n} state={state} />
                              {n.status === "active" ? <span className="text-zinc-800">Running on schedule</span> : null}
                              {n.status === "paused" ? <span className="text-zinc-800">Paused</span> : null}
                              {n.status === "testing" && n.testRun?.status !== "running" ? <span className="text-zinc-800">Test Run done</span> : null}
                            </dd>
                          </div>
                        </dl>
                        {action ? (
                          <div className="mt-3">
                            <ButtonLink href={action.href} size="sm">
                              {action.label}
                            </ButtonLink>
                          </div>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>

              {state.derived.isFreeTrial ? (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                  <Badge tone="amber">Free trial</Badge>
                  Agents only run on a schedule once you buy Credits.
                  <Link href="/credits" className="font-medium text-indigo-600 hover:text-indigo-500">
                    Buy Credits
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
