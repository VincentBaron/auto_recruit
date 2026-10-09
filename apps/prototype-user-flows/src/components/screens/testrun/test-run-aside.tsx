"use client";

// Right-hand column of the Test Run results: labelling progress, proposed Niche Profile
// adjustments, what to do next (buy Credits, or switch the agents on), and the Niche Profile used.

import { useState } from "react";
import { ArrowRight, CalendarClock, CircleCheck, Lock, Power, Rocket, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { PriceHint } from "@/components/ui/price-hint";
import { formatCredits, formatCreditsLabel, formatNumber, formatWeekdayDate, formatWeekdays } from "@/lib/format";
import { PRICES, revealCost, revealedPeopleText } from "@/lib/pricing";
import type { ClientState, Niche, ProfileAdjustment } from "@/lib/types";
import { useAction } from "./use-action";
import { LABELS_FOR_ADJUSTMENTS, nextRunOn, pendingPreviews, perRunQuote } from "./model";
import { Badge, Button, ButtonLink, Card, CardHeader, cx, ErrorText, Modal, ProgressBar, SummaryRow } from "./ui";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export function LabelProgress({ total, good, bad }: { total: number; good: number; bad: number }) {
  const labelled = good + bad;
  return (
    <Card>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-900">Your labels</p>
          <p className="text-xs text-zinc-500 tabular-nums">
            {labelled} of {total} labelled
          </p>
        </div>
        <ProgressBar value={total === 0 ? 0 : labelled / total} className="mt-2" tone={labelled === total && total > 0 ? "green" : "indigo"} />
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 tabular-nums">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            {good} good
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" aria-hidden />
            {bad} bad
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-zinc-300" aria-hidden />
            {total - labelled} to label
          </span>
        </div>
        <p className="mt-2.5 text-xs text-zinc-500">Mark each result good or bad. The agents compare your labels with the Niche Profile and propose adjustments.</p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Adjustments                                                         */
/* ------------------------------------------------------------------ */

export function AdjustmentsPanel({ niche, adjustments, labelled }: { niche: Niche; adjustments: ProfileAdjustment[]; labelled: number }) {
  const { run, pending, error, clearError } = useAction();
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());
  const proposed = adjustments.filter((a) => a.status === "proposed");
  const decided = adjustments.filter((a) => a.status !== "proposed");
  const selected = proposed.filter((a) => !deselected.has(a.id));

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Proposed Niche Profile adjustments"
        description="From your good and bad labels. Nothing changes until you accept."
        actions={proposed.length > 0 ? <Badge tone="indigo">{proposed.length} new</Badge> : undefined}
      />
      {labelled < LABELS_FOR_ADJUSTMENTS && proposed.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm text-zinc-700">
            Label at least {LABELS_FOR_ADJUSTMENTS} results to get proposals.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={labelled / LABELS_FOR_ADJUSTMENTS} className="max-w-32" />
            <span className="text-xs text-zinc-500 tabular-nums">
              {labelled} of {LABELS_FOR_ADJUSTMENTS}
            </span>
          </div>
        </div>
      ) : proposed.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">No adjustment to propose: your labels agree with the Niche Profile. Keep labelling to refine it.</p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100">
            {proposed.map((a) => {
              const checked = !deselected.has(a.id);
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="mt-0.5 size-4 shrink-0 accent-indigo-600" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium text-zinc-900" title={a.title}>
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">{a.rationale}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 line-through decoration-zinc-400">{a.from}</span>
                        <ArrowRight className="size-3 shrink-0 text-zinc-400" aria-hidden />
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">{a.to}</span>
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => run("dismissAdjustment", { nicheId: niche.id, adjustmentId: a.id }, `dismiss:${a.id}`)}
                    disabled={pending !== null}
                    className="-mr-1 shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                    aria-label={`Dismiss: ${a.title}`}
                    title="Dismiss this adjustment"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="space-y-2 border-t border-zinc-100 px-4 py-3">
            {error && <ErrorText onDismiss={clearError}>{error}</ErrorText>}
            <Button
              variant="primary"
              className="w-full"
              icon={CircleCheck}
              disabled={selected.length === 0}
              loading={pending === "acceptAdjustments"}
              onClick={() => run("acceptAdjustments", { nicheId: niche.id, adjustmentIds: selected.map((a) => a.id) })}
            >
              Accept {selected.length} {selected.length === 1 ? "adjustment" : "adjustments"}
            </Button>
            <p className="text-center text-xs text-zinc-500">Updates the Niche Profile and re-scores these results.</p>
          </div>
        </>
      )}
      {decided.length > 0 && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/60">
          {decided.map((a) => (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-2">
              <span className={cx("line-clamp-2 text-xs leading-5", a.status === "dismissed" ? "text-zinc-400 line-through" : "text-zinc-700")} title={a.title}>
                {a.title}
              </span>
              <Badge tone={a.status === "accepted" ? "green" : "neutral"}>{a.status === "accepted" ? "Accepted" : "Dismissed"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Next steps                                                          */
/* ------------------------------------------------------------------ */

export function NextSteps({ state, niche, returnTo }: { state: ClientState; niche: Niche; returnTo: string }) {
  const { run, pending, error, clearError } = useAction();
  const [confirming, setConfirming] = useState(false);
  const paid = state.workspace?.plan === "paid";
  const schedule = niche.schedule;
  const quote = perRunQuote(schedule);
  const scheduleText = `${formatWeekdays(schedule.days)} at ${schedule.time}`;

  if (!paid) {
    const previews = pendingPreviews(state, niche);
    return (
      <Card className="border-indigo-200">
        <CardHeader icon={Lock} title="Reveal people and switch agents on" />
        <div className="space-y-3 px-4 py-3">
          <ul className="space-y-2 text-sm text-zinc-700">
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
              <span>
                See who the {revealedPeopleText(previews)} are, for {formatCreditsLabel(revealCost(previews))} <PriceHint /> taken from your first pack
              </span>
            </li>
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
              <span>Enrich them and add them to Campaigns</span>
            </li>
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
              <span>
                Daily agent runs, {scheduleText}: up to {schedule.prospectsPerRun} Prospects and {schedule.candidatesPerRun} Candidates
              </span>
            </li>
          </ul>
          <ButtonLink href={`/credits?returnTo=${encodeURIComponent(returnTo)}`} variant="primary" className="w-full" trailingIcon={ArrowRight}>
            Buy Credits
          </ButtonLink>
          <p className="text-center text-xs text-zinc-500">Packs from 500 Credits. Credits are only spent per outcome.</p>
        </div>
      </Card>
    );
  }

  if (niche.status === "active") {
    const next = nextRunOn(schedule, state.clock.today);
    return (
      <Card className="border-emerald-200">
        <CardHeader icon={Power} title="Agents are on" description={`Runs ${scheduleText}`} actions={<Badge tone="green">Active</Badge>} />
        <div className="space-y-3 px-4 py-3 text-sm text-zinc-700">
          <p>
            Next run {next ? <span className="font-medium text-zinc-900">{formatWeekdayDate(next)}</span> : "not scheduled"}: up to {schedule.prospectsPerRun} Prospects and{" "}
            {schedule.candidatesPerRun} Candidates.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/feed" variant="primary" size="sm" trailingIcon={ArrowRight}>
              Open the Feed
            </ButtonLink>
            <ButtonLink href={`/niches/${niche.id}#schedule`} size="sm" icon={CalendarClock}>
              Schedule
            </ButtonLink>
          </div>
        </div>
      </Card>
    );
  }

  const balanceAfter = (state.workspace?.credits ?? 0) - quote.maxCredits;
  // The same label as the Niche page and the onboarding steps.
  const switchOnLabel = niche.status === "paused" ? "Switch agents on again" : "Switch agents on";
  return (
    <Card className="border-indigo-200">
      <CardHeader icon={Rocket} title={niche.status === "paused" ? "Agents are paused" : "Agents are off"} description={`Scheduled ${scheduleText}`} />
      <div className="space-y-3 px-4 py-3">
        <div className="text-sm text-zinc-700">
          Each run surfaces up to {schedule.prospectsPerRun} Prospects and {schedule.candidatesPerRun} Candidates above the Fit threshold.
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-zinc-600">
            At most per run
            <PriceHint />
          </span>
          <span className="shrink-0 font-semibold whitespace-nowrap text-zinc-900 tabular-nums">{formatCredits(quote.maxCredits)} Credits</span>
        </div>
        {error && <ErrorText onDismiss={clearError}>{error}</ErrorText>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Power} onClick={() => setConfirming(true)} className="flex-1">
            {switchOnLabel}
          </Button>
          <ButtonLink href={`/niches/${niche.id}#schedule`} icon={CalendarClock}>
            Schedule
          </ButtonLink>
        </div>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={switchOnLabel}
        description={`On "${niche.name}": the Prospection Agent and the Sourcing Agent run ${scheduleText} and charge Credits per outcome.`}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Power}
              loading={pending === "activateNiche"}
              onClick={async () => {
                const r = await run("activateNiche", { nicheId: niche.id });
                if (r.ok) setConfirming(false);
              }}
            >
              {switchOnLabel}, up to {formatCredits(quote.maxCredits)} Credits per run
            </Button>
          </>
        }
      >
        <div className="divide-y divide-zinc-100">
          {quote.lines.map((l) => (
            <SummaryRow key={l.label} label={<span className="text-zinc-800">{l.label}</span>} hint={<span className="text-xs text-zinc-500">{l.detail}</span>} value={`${formatCredits(l.credits)} Credits`} />
          ))}
          <SummaryRow strong label="At most per run" hint={<PriceHint />} value={`${formatCredits(quote.maxCredits)} Credits`} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Only items above the Fit threshold are Surfaced and charged. Balance now {formatCredits(state.workspace?.credits ?? 0)} Credits
          {balanceAfter < 0 ? ": runs stop cleanly when Credits run out, unless auto top-up is on." : `, at least ${formatCredits(balanceAfter)} after the first run.`}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Hiring Contacts found: {PRICES.hiringContactFound} Credit each. Change the volumes from the Niche schedule at any time.
        </p>
        {error && (
          <div className="mt-3">
            <ErrorText onDismiss={clearError}>{error}</ErrorText>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Niche Profile used                                                  */
/* ------------------------------------------------------------------ */

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 py-1.5 text-xs">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-800">{value || "-"}</dd>
    </div>
  );
}

export function ProfileSummary({ niche }: { niche: Niche }) {
  const p = niche.profile;
  const enabledWeights = p.signalWeights.filter((w) => w.enabled).length;
  return (
    <Card>
      <CardHeader
        title="Niche Profile used"
        actions={
          <ButtonLink href={`/niches/${niche.id}`} size="sm" variant="ghost" icon={SlidersHorizontal}>
            Edit
          </ButtonLink>
        }
      />
      <dl className="divide-y divide-zinc-100 px-4 py-1.5">
        <ProfileRow label="Sectors" value={p.sectors.join(", ")} />
        <ProfileRow label="Company size" value={`${formatNumber(p.companySize.min)}-${formatNumber(p.companySize.max)} people`} />
        <ProfileRow label="Funding stages" value={p.fundingStages.length ? p.fundingStages.join(", ") : "Any stage"} />
        <ProfileRow label="Locations" value={p.locations.join(", ")} />
        <ProfileRow label="Role types" value={p.roleTypes.join(", ")} />
        <ProfileRow label="Seniority" value={p.seniority.join(", ")} />
        <ProfileRow label="Fit threshold" value={String(p.fitThreshold)} />
        <ProfileRow label="Signals" value={`${enabledWeights} of ${p.signalWeights.length} weights on`} />
      </dl>
    </Card>
  );
}
