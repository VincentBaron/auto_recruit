"use client";

// /niches/[id]/test-run: launch a Test Run, watch the agents work live, label the results good or
// bad, accept the proposed Niche Profile adjustments, then buy Credits or switch the agents on.

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Circle,
  CircleCheck,
  FlaskConical,
  LoaderCircle,
  Lock,
  Play,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { PriceHint } from "@/components/ui/price-hint";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCredits, formatCreditsLabel, formatDate, formatNumber, formatRelative } from "@/lib/format";
import { NICHE_STATUS_LABELS } from "@/lib/labels";
import { revealCost, revealedPeopleText } from "@/lib/pricing";
import { openDataRequestFor } from "@/lib/retention";
import type { ClientState, Niche, NicheStatus, TestRun, TestRunItem, TestRunLabel } from "@/lib/types";
import { useAppState, useBackendError, useFastPolling } from "@/lib/api";
import { useAction } from "./use-action";
import { isFreeTrial, pendingPreviews, resolveItems, revealCreditsFor, TEST_RUN_PROSPECTS, testRunQuote, type ResolvedItem } from "./model";
import { CandidatePreviewResult, CandidateResult, ProspectResult, ResultSkeleton } from "./result-cards";
import { AdjustmentsPanel, LabelProgress, NextSteps, ProfileSummary } from "./test-run-aside";
import {
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ErrorText,
  Modal,
  ProgressBar,
  Segmented,
  Skeleton,
  SummaryRow,
  type Tone,
} from "./ui";

const STATUS_TONES: Record<NicheStatus, Tone> = { draft: "neutral", testing: "sky", active: "green", paused: "amber" };

export function TestRunScreen({ nicheId }: { nicheId: string }) {
  const state = useAppState();
  const backendError = useBackendError();
  const niche = state?.niches.find((n) => n.id === nicheId) ?? null;
  const testRun = niche?.testRun ?? null;
  useFastPolling(testRun?.status === "running");

  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <LoadingView />;
  if (!state.session.signedIn || !state.workspace) {
    return (
      <PageContainer className="@container">
        <PageHeader title="Test Run" />
        <SignedOutState what="describe your Niche and run a free Test Run" />
      </PageContainer>
    );
  }
  if (!niche) {
    return (
      <PageContainer className="@container">
        <Breadcrumbs items={[{ label: "Niches", href: "/niches" }, { label: "Test Run" }]} />
        <Card>
          <EmptyState
            icon={SearchX}
            title="Niche not found"
            actions={
              <ButtonLink href="/niches" variant="primary">
                See your Niches
              </ButtonLink>
            }
          >
            It may have been deleted, or the simulator was reset.
          </EmptyState>
        </Card>
      </PageContainer>
    );
  }

  const returnTo = `/niches/${niche.id}/test-run`;

  return (
    <PageContainer className="@container">
      <Breadcrumbs items={[{ label: "Niches", href: "/niches" }, { label: niche.name, href: `/niches/${niche.id}` }, { label: "Test Run" }]} />
      <TestRunHeader state={state} niche={niche} testRun={testRun} />
      {!testRun ? (
        <LaunchView state={state} niche={niche} />
      ) : testRun.status === "running" ? (
        <RunningView niche={niche} testRun={testRun} />
      ) : (
        <ResultsView state={state} niche={niche} testRun={testRun} returnTo={returnTo} />
      )}
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Header and launching                                                */
/* ------------------------------------------------------------------ */

function TestRunHeader({ state, niche, testRun }: { state: ClientState; niche: Niche; testRun: TestRun | null }) {
  const [confirming, setConfirming] = useState(false);
  const canRunAgain = testRun?.status === "done" && state.workspace?.plan === "paid";
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Test Run</span>
            <Badge tone={STATUS_TONES[niche.status]}>{NICHE_STATUS_LABELS[niche.status]}</Badge>
            {testRun && (testRun.free ? <Badge tone="indigo">Free Test Run</Badge> : <Badge tone="neutral">Paid Test Run</Badge>)}
          </span>
        }
        description={
          // Two lines on a phone; one line from sm, where the date and its separator never split.
          <span className="flex flex-col sm:block">
            <span className="text-zinc-700">{niche.name}</span>
            <span className="sm:whitespace-nowrap">
              <span className="mx-1.5 hidden sm:inline" aria-hidden>
                ·
              </span>
              {testRun
                ? testRun.status === "running"
                  ? "Running now"
                  : `Ran on ${formatDate(testRun.completedOn ?? testRun.startedOn)} (${formatRelative(testRun.completedOn ?? testRun.startedOn, state.clock.today)})`
                : "Not run yet"}
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/niches/${niche.id}`} icon={SlidersHorizontal}>
              Review Niche Profile
            </ButtonLink>
            {canRunAgain && (
              <Button icon={RotateCcw} onClick={() => setConfirming(true)}>
                Run again
              </Button>
            )}
          </>
        }
      />
      <LaunchConfirm state={state} niche={niche} open={confirming} onClose={() => setConfirming(false)} replacing />
    </>
  );
}

function LaunchConfirm({ state, niche, open, onClose, replacing = false }: { state: ClientState; niche: Niche; open: boolean; onClose: () => void; replacing?: boolean }) {
  const { run, pending, error, clearError } = useAction();
  const quote = testRunQuote(state);
  const balance = state.workspace?.credits ?? 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={replacing ? "Run the Test Run again" : "Launch a Test Run"}
      description={`On "${niche.name}", with the current Niche Profile.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={Play}
            disabled={quote.blocked !== null}
            loading={pending === "launchTestRun"}
            onClick={async () => {
              const r = await run("launchTestRun", { nicheId: niche.id });
              if (r.ok) onClose();
            }}
          >
            {quote.maxCredits === 0 ? "Launch, 0 Credits" : `Launch, up to ${formatCredits(quote.maxCredits)} Credits`}
          </Button>
        </>
      }
    >
      <div className="divide-y divide-zinc-100">
        {quote.lines.map((l) => (
          <SummaryRow key={l.label} label={<span className="text-zinc-800">{l.label}</span>} hint={<span className="text-xs text-zinc-500">{l.detail}</span>} value={`${formatCredits(l.credits)} Credits`} />
        ))}
        <SummaryRow strong label="At most" hint={<PriceHint />} value={`${formatCredits(quote.maxCredits)} Credits`} />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Balance {formatCredits(balance)} Credits. Only results above the Fit threshold are charged.
        {replacing && " The new results replace these ones, and labelling starts over."}
      </p>
      {quote.blocked && (
        <div className="mt-3">
          <ErrorText>{quote.blocked}</ErrorText>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorText onDismiss={clearError}>{error}</ErrorText>
        </div>
      )}
    </Modal>
  );
}

function LaunchView({ state, niche }: { state: ClientState; niche: Niche }) {
  const { run, pending, error, clearError } = useAction();
  const [confirming, setConfirming] = useState(false);
  const quote = testRunQuote(state);
  const freeTrial = isFreeTrial(state);
  const p = niche.profile;

  const launch = () => {
    if (quote.maxCredits > 0) setConfirming(true);
    else void run("launchTestRun", { nicheId: niche.id });
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <div className="px-5 py-6 sm:px-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100 ring-inset">
            <FlaskConical className="size-5 text-indigo-600" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Test the Niche Profile before switching the agents on</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            The Prospection Agent and the Sourcing Agent run once on this Niche Profile. Mark each result good or bad and they propose adjustments, so the daily runs
            surface the right Prospects and Candidates from day one.
          </p>

          <div className="mt-5 grid gap-3 @2xl:grid-cols-3">
            <WhatYouGet icon={Target} title="10 Prospects in full" text="Company facts, Signals with evidence, Detected Roles and an explained Signal Strength." />
            <WhatYouGet
              icon={freeTrial ? Lock : UserRound}
              title="Hiring Contacts and Candidates"
              text={freeTrial ? "As anonymised Previews in the free trial: never stored until you buy Credits." : "Up to 2 Hiring Contacts per Prospect and 10 Candidates, revealed."}
            />
            <WhatYouGet icon={Sparkles} title="Proposed adjustments" text="Changes to the Niche Profile drawn from your good and bad labels, to accept or dismiss." />
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {quote.free ? (
                <p className="font-medium text-zinc-900">
                  Free Test Run <span className="font-normal text-zinc-500">· 0 Credits, once per Main Domain</span>
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-zinc-900">
                  Up to {formatCredits(quote.maxCredits)} Credits <PriceHint />
                </p>
              )}
              <p className="mt-0.5 text-xs text-zinc-500">Takes about 6 seconds. You can leave this page while it runs.</p>
            </div>
            {quote.blocked ? (
              <ButtonLink href={`/credits?returnTo=${encodeURIComponent(`/niches/${niche.id}/test-run`)}`} variant="primary" trailingIcon={ArrowRight}>
                Buy Credits
              </ButtonLink>
            ) : (
              <Button variant="primary" icon={Play} loading={pending === "launchTestRun"} onClick={launch}>
                {quote.free ? "Launch free Test Run" : "Launch Test Run"}
              </Button>
            )}
          </div>
          {quote.blocked && (
            <div className="mt-3">
              <Callout tone="amber" icon={Lock}>
                {quote.blocked}
              </Callout>
            </div>
          )}
          {!niche.setupComplete && (
            <div className="mt-3">
              <Callout tone="amber" icon={SlidersHorizontal} title="The Niche Profile is not complete yet">
                Finish the setup or review the Niche Profile first: results follow what it says.
              </Callout>
            </div>
          )}
          {error && (
            <div className="mt-3">
              <ErrorText onDismiss={clearError}>{error}</ErrorText>
            </div>
          )}
        </div>
      </Card>
      <div className="space-y-4">
        <ProfileSummary niche={niche} />
        {p.searchStrategy.length > 0 && (
          <Card>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-zinc-900">Search strategy</p>
              <ul className="mt-2 space-y-1.5">
                {p.searchStrategy.map((q) => (
                  <li key={q} className="flex gap-2 text-xs text-zinc-600">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                    <span className="min-w-0">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}
      </div>
      <LaunchConfirm state={state} niche={niche} open={confirming} onClose={() => setConfirming(false)} />
    </div>
  );
}

function WhatYouGet({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3.5 py-3">
      <Icon className="size-4 text-zinc-500" aria-hidden />
      <p className="mt-2 text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

function RunningView({ niche, testRun }: { niche: Niche; testRun: TestRun }) {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <LoaderCircle className="size-4 animate-spin text-indigo-600" aria-hidden />
              Agents at work
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">Prospection Agent and Sourcing Agent on {niche.name}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-zinc-900 tabular-nums">{Math.round(testRun.progress * 100)}%</span>
        </div>
        <div className="px-5">
          <ProgressBar value={testRun.progress} />
        </div>
        <ol className="mt-2 divide-y divide-zinc-100 px-5 pb-2">
          {testRun.steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 py-2.5">
              {s.status === "done" ? (
                <CircleCheck className="size-4.5 shrink-0 text-emerald-500" aria-label="Done" />
              ) : s.status === "running" ? (
                <LoaderCircle className="size-4.5 shrink-0 animate-spin text-indigo-600" aria-label="Running" />
              ) : (
                <Circle className="size-4.5 shrink-0 text-zinc-300" aria-label="Waiting" />
              )}
              <span className={s.status === "pending" ? "text-sm text-zinc-400" : "text-sm font-medium text-zinc-900"}>
                <span className="mr-1.5 text-zinc-400 tabular-nums">{i + 1}.</span>
                {s.label}
              </span>
              <span className="ml-auto truncate pl-3 text-xs text-zinc-500">{s.status === "done" ? s.detail ?? "Done" : s.status === "running" ? "Running..." : "Waiting"}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-3 opacity-60" aria-hidden>
        <ResultSkeleton />
        <ResultSkeleton />
        <ResultSkeleton />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

type Filter = "all" | "unlabelled" | "good" | "bad";

function omit(record: Record<string, TestRunLabel | null>, key: string): Record<string, TestRunLabel | null> {
  const next = { ...record };
  delete next[key];
  return next;
}

function ResultsView({ state, niche, testRun, returnTo }: { state: ClientState; niche: Niche; testRun: TestRun; returnTo: string }) {
  const { run, error, clearError } = useAction();
  const [tab, setTab] = useState<"prospects" | "candidates">("prospects");
  const [filter, setFilter] = useState<Filter>("all");
  /** Labels clicked but not yet confirmed by the backend, so the toggle answers instantly. */
  const [optimistic, setOptimistic] = useState<Record<string, TestRunLabel | null>>({});
  const freeTrial = isFreeTrial(state);
  const today = state.clock.today;
  const threshold = niche.profile.fitThreshold;

  const resolved = useMemo(() => resolveItems(state, testRun), [state, testRun]);
  const labelOf = (item: TestRunItem): TestRunLabel | null => (item.id in optimistic ? optimistic[item.id] : item.label);

  const prospects = resolved.filter((r) => r.kind === "prospect");
  const people = resolved.filter((r) => r.kind !== "prospect");
  const good = resolved.filter((r) => labelOf(r.item) === "good").length;
  const bad = resolved.filter((r) => labelOf(r.item) === "bad").length;
  const list = (tab === "prospects" ? prospects : people).filter((r) => {
    const l = labelOf(r.item);
    return filter === "all" ? true : filter === "unlabelled" ? l === null : l === filter;
  });
  const previews = pendingPreviews(state, niche);
  // A free Test Run costs nothing, but revealing its people on the first pack is charged (ADR-0018).
  const revealCredits = testRun.free ? revealCreditsFor(state.creditLedger, niche.id) : 0;
  const tabCount = (rs: ResolvedItem[], f: Filter) =>
    rs.filter((r) => {
      const l = labelOf(r.item);
      return f === "all" ? true : f === "unlabelled" ? l === null : l === f;
    }).length;
  const current = tab === "prospects" ? prospects : people;

  async function setLabel(item: TestRunItem, clicked: TestRunLabel) {
    const next = labelOf(item) === clicked ? null : clicked;
    setOptimistic((o) => ({ ...o, [item.id]: next }));
    await run("labelTestRunItem", { nicheId: niche.id, itemId: item.id, label: next }, `label:${item.id}`);
    setOptimistic((o) => omit(o, item.id));
  }

  const stats = testRun.stats;
  const proposedCount = testRun.adjustments.filter((a) => a.status === "proposed").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
        <StatTile label="Searched" value={formatNumber(stats.searched)} hint="companies" />
        <StatTile
          label="Above Fit threshold"
          value={formatNumber(stats.aboveThreshold)}
          hint={stats.searched > 0 ? `${Math.round((stats.aboveThreshold / stats.searched) * 100)}% of those searched` : undefined}
        />
        {stats.shown < TEST_RUN_PROSPECTS && stats.shown === stats.aboveThreshold ? (
          <StatTile label="Showing" value={formatNumber(stats.shown)} hint={`Only ${formatNumber(stats.shown)} above the threshold`} />
        ) : (
          <StatTile label="Showing the top" value={formatNumber(stats.shown)} hint="by Signal Strength" />
        )}
        <StatTile label="Signals extracted" value={formatNumber(stats.signalsExtracted)} hint="dated, with evidence" />
        <StatTile label="Hiring Contacts" value={formatNumber(stats.hiringContactsFound)} hint={freeTrial ? "found, as Previews" : "found"} />
        <StatTile
          label="Credits charged"
          value={formatCredits(testRun.creditsCharged + revealCredits)}
          hint={
            testRun.free && testRun.creditsCharged === 0
              ? revealCredits > 0
                ? `Free Test Run, ${formatCredits(revealCredits)} to reveal its people`
                : "Free Test Run"
              : <PriceHint />
          }
        />
      </div>

      {freeTrial && (
        <Callout
          tone="indigo"
          icon={Lock}
          title="Buy Credits to reveal people and switch agents on"
          actions={
            <ButtonLink href={`/credits?returnTo=${encodeURIComponent(returnTo)}`} variant="primary" trailingIcon={ArrowRight}>
              Buy Credits
            </ButtonLink>
          }
        >
          Prospects are shown in full. The {revealedPeopleText(previews)} are Previews: anonymised, generated on the fly and never stored until your Workspace buys
          Credits. Your first pack reveals them for {formatCreditsLabel(revealCost(previews))} <PriceHint />, taken from the pack at the normal price.
        </Callout>
      )}

      {error && <ErrorText onDismiss={clearError}>{error}</ErrorText>}

      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-6 @4xl:grid-cols-[minmax(0,1fr)_320px] @4xl:grid-rows-[auto_1fr] @4xl:gap-y-4">
        <div className="space-y-4 @4xl:col-start-2 @4xl:row-start-1">
          <LabelProgress total={resolved.length} good={good} bad={bad} />
          <div id="adjustments" className="scroll-mt-6">
            <AdjustmentsPanel niche={niche} adjustments={testRun.adjustments} labelled={good + bad} />
          </div>
        </div>
        <section className="min-w-0 @4xl:col-start-1 @4xl:row-span-2 @4xl:row-start-1" aria-label="Results">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              label="Result type"
              value={tab}
              onChange={(v) => {
                setTab(v);
                setFilter("all");
              }}
              options={[
                { value: "prospects", label: "Prospects", count: prospects.length },
                { value: "candidates", label: "Candidates", count: people.length },
              ]}
            />
            <Segmented
              label="Filter by label"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: tabCount(current, "all") },
                { value: "unlabelled", label: "To label", count: tabCount(current, "unlabelled") },
                { value: "good", label: "Good", count: tabCount(current, "good") },
                { value: "bad", label: "Bad", count: tabCount(current, "bad") },
              ]}
            />
          </div>

          {proposedCount > 0 && (
            <a
              href="#adjustments"
              className="mb-3 flex items-center justify-between gap-3 rounded-md border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-sm text-indigo-950 transition-colors hover:bg-indigo-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-indigo-600" aria-hidden />
                <span className="truncate">
                  {proposedCount} Niche Profile {proposedCount === 1 ? "adjustment" : "adjustments"} proposed from your labels
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-700">
                Review
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </a>
          )}

          {tab === "candidates" && freeTrial && people.length > 0 && (
            <p className="mb-3 text-xs text-zinc-500">
              Candidates in the free trial are Previews: a one-line anonymised summary with Fit and Signal Strength. Their identity is revealed once you buy Credits.
            </p>
          )}

          {current.length === 0 ? (
            <Card>
              <EmptyState icon={SearchX} title={tab === "prospects" ? "No Prospect in this Test Run" : "No Candidate in this Test Run"}>
                {tab === "prospects"
                  ? "Nothing was above the Fit threshold. Review the Niche Profile and run again."
                  : "Candidates found by this Test Run were deleted (under the 25-day retention rule, after an Opt-out or at their request), or nothing was above the Fit threshold."}
              </EmptyState>
            </Card>
          ) : list.length === 0 ? (
            <Card>
              <EmptyState icon={CircleCheck} title={filter === "unlabelled" ? "Everything here is labelled" : `No result labelled ${filter}`}>
                {filter === "unlabelled" ? "Review the proposed adjustments, then switch the agents on." : "Change the filter to see the other results."}
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-3">
              {list.map((r) => {
                const label = labelOf(r.item);
                const onLabel = (l: TestRunLabel) => void setLabel(r.item, l);
                if (r.kind === "prospect") {
                  const p = r.prospect;
                  return (
                    <ProspectResult
                      key={r.item.id}
                      prospect={p}
                      roles={state.detectedRoles.filter((d) => d.prospectId === p.id)}
                      hiringContacts={state.hiringContacts.filter((h) => h.prospectId === p.id && !h.proposed).sort((a, b) => a.rank - b.rank)}
                      hiringContactPreviews={state.previews.filter((pv) => pv.kind === "hiring_contact" && pv.prospectId === p.id)}
                      freeTrial={freeTrial}
                      fitThreshold={threshold}
                      today={today}
                      label={label}
                      onLabel={onLabel}
                    />
                  );
                }
                if (r.kind === "candidate") {
                  return (
                    <CandidateResult
                      key={r.item.id}
                      candidate={r.candidate}
                      fitThreshold={threshold}
                      today={today}
                      onHold={openDataRequestFor(state, { kind: "candidate", id: r.candidate.id }) !== null}
                      label={label}
                      onLabel={onLabel}
                    />
                  );
                }
                return <CandidatePreviewResult key={r.item.id} preview={r.preview} fitThreshold={threshold} today={today} label={label} onLabel={onLabel} />;
              })}
            </div>
          )}
        </section>

        <div className="space-y-4 @4xl:col-start-2 @4xl:row-start-2">
          <NextSteps state={state} niche={niche} returnTo={returnTo} />
          <ProfileSummary niche={niche} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function LoadingView() {
  return (
    <PageContainer className="@container">
      <Skeleton className="mb-4 h-3 w-56" />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="mb-6 h-20 w-full" />
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </PageContainer>
  );
}
