"use client";

// /campaigns/new: Niche and audience, Brief, Sequence, Sending, Autonomy, Recipients, then sample
// drafts for three recipients with the footer, and launch (cost shown before confirming). The step is
// in the URL and the draft is saved per tab, so Back, Forward and reload never lose anything.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coins, Pencil, Rocket, Save } from "lucide-react";
import { formatCredits, formatWeekdays } from "@/lib/format";
import { AUDIENCE_LABELS, AUTONOMY_LABELS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { ClientState, DraftPreview } from "@/lib/types";
import { act, useAppState, useBackendError } from "@/lib/api";
import { mailboxById, nicheName } from "./derive";
import { AudienceBadge, Breadcrumbs, EmailCard, Gate, HeaderSkeleton } from "./shared";
import { Button, Callout, Card, CardHeader, Meta, Modal, PageContainer, PageHeader, PriceHint, Skeleton, ToastProvider, cx, useToast } from "./ui";
import {
  AutonomyStep,
  BriefStep,
  NicheStep,
  RecipientsStep,
  SendingStep,
  SequenceStepView,
  ShieldNote,
  sequenceSummary,
  type StepProps,
} from "./wizard-steps";
import {
  STEPS,
  clearWizardSnapshot,
  initialDraft,
  isWizardSessionId,
  newWizardSessionId,
  readWizardSnapshot,
  selectedRefs,
  shortNicheName,
  stepError,
  stepIndex,
  toCampaignInput,
  writeWizardSnapshot,
  type StepKey,
  type WizardDraft,
  type WizardPrefill,
  type WizardSnapshot,
} from "./wizard-model";

export function CampaignWizard({ prefill }: { prefill: WizardPrefill }) {
  const state = useAppState();
  const error = useBackendError();
  return (
    <ToastProvider>
      <Gate state={state} error={error} skeleton={<WizardSkeleton />}>
        {(s) => (
          <Suspense
            fallback={
              <PageContainer>
                <WizardSkeleton />
              </PageContainer>
            }
          >
            <WizardSession state={s} prefill={prefill} />
          </Suspense>
        )}
      </Gate>
    </ToastProvider>
  );
}

function WizardSkeleton() {
  return (
    <>
      <Skeleton className="mb-2 h-4 w-40" />
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <div className="hidden space-y-3 lg:block">
          {STEPS.map((s) => (
            <Skeleton key={s.key} className="h-9 w-full" />
          ))}
        </div>
        <Card className="p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </Card>
      </div>
    </>
  );
}

function stepSummary(key: StepKey, d: WizardDraft, state: ClientState): string {
  switch (key) {
    case "niche":
      return d.nicheId ? `${shortNicheName(state.niches.find((n) => n.id === d.nicheId))}, ${AUDIENCE_LABELS[d.audience]}` : "Not chosen";
    case "brief":
      return d.detectedRoleId ? state.detectedRoles.find((r) => r.id === d.detectedRoleId)?.title ?? "With a Detected Role" : d.angle.trim() ? "Angle written" : "To write";
    case "sequence":
      return sequenceSummary(d);
    case "sending":
      return `${d.mailboxIds.length} ${d.mailboxIds.length === 1 ? "mailbox" : "mailboxes"}, ${formatWeekdays(d.days)}`;
    case "autonomy":
      return d.autonomy === "review_first_n" ? `Review the first ${Number.isFinite(d.reviewFirstN) ? d.reviewFirstN : "-"}` : AUTONOMY_LABELS[d.autonomy];
    case "recipients":
      return `${d.selected.length} selected${d.autoAdd ? ", auto-add on" : ""}`;
    case "drafts":
      return "Check and launch";
  }
}

export type DraftsState = { status: "loading" } | { status: "done"; drafts: DraftPreview[] } | { status: "error"; error: string };

const WIZARD_PATH = "/campaigns/new";

/**
 * Picks the wizard session: the one named in the URL (`?draft=`), restored from this tab's
 * sessionStorage, or a new one. Runs after mount, before paint, so the server render and the first
 * client render stay identical (the skeleton) and nothing flashes. A link to a fresh wizard, or
 * Back into another wizard session, switches session the same way.
 */
function WizardSession({ state, prefill }: { state: ClientState; prefill: WizardPrefill }) {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("draft");
  const firstId = useRef<string | null>(null);
  /** The URL has named the current session at least once (the wizard wrote `?draft=` into it). */
  const named = useRef(false);
  const [session, setSession] = useState<{ id: string; restored: WizardSnapshot | null } | null>(null);

  useLayoutEffect(() => {
    if (session && urlSessionId === session.id) {
      named.current = true;
      return;
    }
    // The wizard has not written its session into the URL yet: nothing to switch.
    if (session && urlSessionId === null && !named.current) return;
    const id = isWizardSessionId(urlSessionId) ? urlSessionId : session ? newWizardSessionId() : (firstId.current ??= newWizardSessionId());
    named.current = urlSessionId === id;
    setSession({ id, restored: readWizardSnapshot(id) });
  }, [urlSessionId, session]);

  if (!session) {
    return (
      <PageContainer>
        <WizardSkeleton />
      </PageContainer>
    );
  }
  return <Wizard key={session.id} state={state} prefill={prefill} sessionId={session.id} restored={session.restored} />;
}

function Wizard({ state, prefill, sessionId, restored }: { state: ClientState; prefill: WizardPrefill; sessionId: string; restored: WizardSnapshot | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [draft, setDraft] = useState<WizardDraft>(() => restored?.draft ?? initialDraft(state, prefill));
  const [maxReached, setMaxReached] = useState(() => restored?.maxReached ?? 0);
  const [dirty, setDirty] = useState(() => restored?.dirty ?? false);
  const [errorStep, setErrorStep] = useState<StepKey | null>(null);
  const [busy, setBusy] = useState<"launch" | "draft" | null>(null);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [drafts, setDrafts] = useState<DraftsState>({ status: "loading" });
  /** Set once the Campaign is created: the saved draft is gone and must not be written again. */
  const finished = useRef(false);

  // The step lives in the URL (`?step=brief`), so Back and Forward move between steps. A step
  // never reached yet (a hand-edited URL) falls back to the furthest one reached.
  const index = Math.min(stepIndex(searchParams.get("step")), maxReached);
  const step = STEPS[index];
  const error = stepError(step.key, draft, state);
  const showErrors = errorStep === step.key;

  const urlFor = useCallback(
    (i: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("draft", sessionId);
      params.set("step", STEPS[i].key);
      return `${WIZARD_PATH}?${params.toString()}`;
    },
    [searchParams, sessionId],
  );

  // Name the session and the step in the URL (without a new history entry), so a reload or a link
  // opened from the wizard comes back to the same draft and step. Once named, a URL naming another
  // session (or none) is a navigation to another wizard: WizardSession takes over, never fought here.
  const named = useRef(false);
  useEffect(() => {
    const urlSession = searchParams.get("draft");
    if (urlSession === sessionId) {
      named.current = true;
      if (searchParams.get("step") === step.key) return;
    } else if (named.current) {
      return;
    }
    window.history.replaceState(null, "", urlFor(index));
  }, [searchParams, sessionId, step.key, index, urlFor]);

  // Save the draft for this tab after every change.
  useEffect(() => {
    if (finished.current) return;
    writeWizardSnapshot(sessionId, { draft, maxReached, dirty });
  }, [sessionId, draft, maxReached, dirty]);

  // Closing the tab loses the draft (sessionStorage is per tab): ask first while it holds edits.
  useEffect(() => {
    if (!dirty || busy !== null) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  const update = (patch: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const props: StepProps = { state, draft, update };

  const firstInvalid = STEPS.findIndex((s) => stepError(s.key, draft, state) !== null);
  const go = (i: number) => {
    setErrorStep(null);
    setMaxReached((m) => Math.max(m, i));
    if (i !== index) window.history.pushState(null, "", urlFor(i));
    document.getElementById("wizard-top")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const next = () => {
    if (error) {
      setErrorStep(step.key);
      return;
    }
    go(Math.min(index + 1, STEPS.length - 1));
  };

  // Sample drafts: the Outreach Agent drafts for up to three of the selected recipients.
  const draftsPayload = useMemo(() => {
    const input = toCampaignInput(draft);
    const people = selectedRefs(draft).slice(0, 3);
    return {
      nicheId: input.nicheId,
      audience: input.audience,
      brief: input.brief,
      sequence: input.sequence,
      ...(people.length > 0 ? { people } : {}),
    };
  }, [draft]);
  const draftsKey = JSON.stringify(draftsPayload);
  useEffect(() => {
    if (step.key !== "drafts") return;
    let cancelled = false;
    setDrafts({ status: "loading" });
    void act("previewDrafts", JSON.parse(draftsKey) as typeof draftsPayload).then((res) => {
      if (cancelled) return;
      setDrafts(res.ok ? { status: "done", drafts: res.result.drafts } : { status: "error", error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [step.key, draftsKey]);

  const recipients = draft.selected.length;
  const maxEmails = recipients * draft.sequence.length;
  const maxCost = maxEmails * PRICES.emailSent;
  const balance = state.workspace?.credits ?? 0;

  const submit = async (launch: boolean) => {
    if (firstInvalid !== -1 && firstInvalid < STEPS.length - 1) {
      setConfirmLaunch(false);
      go(firstInvalid);
      setErrorStep(STEPS[firstInvalid].key);
      return;
    }
    setBusy(launch ? "launch" : "draft");
    const created = await act("createCampaign", toCampaignInput(draft));
    if (!created.ok) {
      toast({ tone: "danger", title: "The Campaign was not created", description: created.error });
      setBusy(null);
      setConfirmLaunch(false);
      return;
    }
    // The Campaign exists from here on: the wizard's saved draft is done with.
    finished.current = true;
    clearWizardSnapshot(sessionId);
    const id = created.result.campaignId;
    const params = new URLSearchParams();
    const refs = selectedRefs(draft);
    if (refs.length > 0) {
      const added = await act("addRecipients", { campaignId: id, people: refs });
      if (added.ok) {
        if (added.result.skipped.length > 0) params.set("skipped", String(added.result.skipped.length));
      } else {
        params.set("addError", added.error);
      }
    }
    if (launch) {
      const launched = await act("launchCampaign", { campaignId: id });
      if (launched.ok) params.set("launched", "1");
      else params.set("launchError", launched.error);
    } else {
      params.set("created", "1");
    }
    router.push(`/campaigns/${id}?${params.toString()}`);
  };

  return (
    <PageContainer>
      <div id="wizard-top" className="scroll-mt-[calc(var(--chrome-h)+1rem)]" />
      <Breadcrumbs items={[{ label: "Campaigns", href: "/campaigns" }, { label: "New Campaign" }]} />
      <PageHeader
        title="New Campaign"
        description="Outreach to Hiring Contacts or Candidates within one Niche. Nothing is sent before you launch, and the first drafts wait for your review."
      />

      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Step navigation */}
        <nav aria-label="Steps" className="min-w-0">
          <div className="lg:hidden">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                Step {index + 1} of {STEPS.length}
              </span>
              <span className="font-medium text-zinc-800">{step.label}</span>
            </div>
            <div className="mt-2 flex gap-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  aria-label={s.label}
                  aria-current={i === index ? "step" : undefined}
                  disabled={i > maxReached}
                  onClick={() => go(i)}
                  className={cx("h-1.5 flex-1 rounded-full", i <= index ? "bg-indigo-600" : i <= maxReached ? "bg-indigo-200" : "bg-zinc-200")}
                />
              ))}
            </div>
          </div>
          <ol className="sticky top-[calc(var(--chrome-h)+1rem)] hidden space-y-1 lg:block">
            {STEPS.map((s, i) => {
              const current = i === index;
              const reachable = i <= maxReached;
              const complete = i < index || (reachable && i !== index && stepError(s.key, draft, state) === null);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    onClick={() => go(i)}
                    className={cx(
                      "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                      current ? "bg-white shadow-sm ring-1 ring-zinc-200" : reachable ? "hover:bg-zinc-100" : "cursor-default",
                    )}
                  >
                    <span
                      className={cx(
                        "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        current ? "bg-indigo-600 text-white" : complete ? "bg-indigo-100 text-indigo-700" : "bg-zinc-200 text-zinc-500",
                      )}
                    >
                      {complete && !current ? <Check className="size-3" aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block text-sm", current ? "font-medium text-zinc-900" : reachable ? "text-zinc-700" : "text-zinc-400")}>{s.label}</span>
                      {reachable ? <span className="block truncate text-xs text-zinc-500">{stepSummary(s.key, draft, state)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step content */}
        <Card>
          <CardHeader title={step.label} description={step.description} />
          <div className="px-4 py-5 sm:px-6">
            {step.key === "niche" ? <NicheStep {...props} /> : null}
            {step.key === "brief" ? <BriefStep {...props} /> : null}
            {step.key === "sequence" ? <SequenceStepView {...props} /> : null}
            {step.key === "sending" ? <SendingStep {...props} /> : null}
            {step.key === "autonomy" ? <AutonomyStep {...props} /> : null}
            {step.key === "recipients" ? <RecipientsStep {...props} /> : null}
            {step.key === "drafts" ? <DraftsStep state={state} draft={draft} drafts={drafts} onEdit={(k) => go(STEPS.findIndex((s) => s.key === k))} /> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 sm:px-6">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => go(Math.max(0, index - 1))} disabled={index === 0}>
              Back
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {showErrors && error ? (
                <span role="alert" className="text-xs text-red-600">
                  {error}
                </span>
              ) : null}
              {step.key === "drafts" ? (
                <>
                  <Button icon={<Save className="size-3.5" aria-hidden />} loading={busy === "draft"} disabled={busy !== null} onClick={() => void submit(false)}>
                    Save as draft
                  </Button>
                  <Button variant="primary" icon={<Rocket className="size-3.5" aria-hidden />} disabled={busy !== null} onClick={() => setConfirmLaunch(true)}>
                    Launch Campaign
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={next}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={confirmLaunch}
        onClose={() => (busy ? undefined : setConfirmLaunch(false))}
        title={`Launch "${draft.name.trim() || "New Campaign"}"?`}
        description="Emails go out within the sending window, from your Sending Mailboxes and within their daily caps."
        footer={
          <>
            <Button onClick={() => setConfirmLaunch(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Rocket className="size-3.5" aria-hidden />} loading={busy === "launch"} onClick={() => void submit(true)}>
              Launch Campaign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm">
              <span className="text-zinc-600">Recipients</span>
              <span className="tabular-nums text-zinc-900">{recipients}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm">
              <span className="text-zinc-600">Emails per recipient</span>
              <span className="tabular-nums text-zinc-900">up to {draft.sequence.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-1.5 text-zinc-600">
                Email sent <PriceHint />
              </span>
              <span className="tabular-nums text-zinc-900">{PRICES.emailSent} Credit each</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-zinc-900">
                <Coins className="size-4 text-zinc-400" aria-hidden /> At most
              </span>
              <span className="font-semibold tabular-nums text-zinc-900">{formatCredits(maxCost)} Credits</span>
            </div>
          </div>
          <p className="text-sm leading-6 text-zinc-600">
            Credits are charged only when an email is sent, so replies and stops lower the total. Balance:{" "}
            <span className="font-medium tabular-nums text-zinc-900">{formatCredits(balance)} Credits</span>.
            {draft.autoAdd ? " People added later by the auto-add rule are charged the same way." : ""}
          </p>
          {maxCost > balance ? (
            <Callout tone="warning">Your balance does not cover every email. Sending stops cleanly when Credits run out, unless auto top-up is on.</Callout>
          ) : null}
          {draft.autonomy !== "auto" && recipients > 0 ? (
            <Callout tone="info">
              {draft.autonomy === "review_all"
                ? `All ${recipients} first ${recipients === 1 ? "email waits" : "emails wait"} in the review queue until you approve them.`
                : `The first ${Math.min(recipients, draft.reviewFirstN)} ${Math.min(recipients, draft.reviewFirstN) === 1 ? "email waits" : "emails wait"} in the review queue until you approve them.`}
            </Callout>
          ) : null}
        </div>
      </Modal>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Drafts and launch                                                */
/* ------------------------------------------------------------------ */

export function DraftsStep({ state, draft, drafts: sample, onEdit }: { state: ClientState; draft: WizardDraft; drafts: DraftsState; onEdit: (k: StepKey) => void }) {
  const [tab, setTab] = useState(0);
  const role = draft.detectedRoleId ? state.detectedRoles.find((r) => r.id === draft.detectedRoleId) : undefined;
  const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  const mailboxes = draft.mailboxIds.map((id) => mailboxById(state, id)).filter((m) => m !== undefined);
  const drafts = sample.status === "done" ? sample.drafts : [];
  const active = drafts[Math.min(tab, Math.max(0, drafts.length - 1))];

  const editLink = (k: StepKey) => (
    <button type="button" onClick={() => onEdit(k)} className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-500">
      <Pencil className="size-3" aria-hidden /> Edit
    </button>
  );

  let day = 0;
  const dayLabels = draft.sequence.map((s, i) => {
    if (i > 0) day += Number.isFinite(s.delayDays) ? s.delayDays : 0;
    return day;
  });

  return (
    <div className="space-y-7">
      <section>
        <h3 className="text-sm font-semibold text-zinc-900">Summary</h3>
        <dl className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 px-4">
          <Meta label="Niche">
            <span className="flex flex-wrap items-center gap-2">
              {draft.nicheId ? nicheName(state, draft.nicheId) : "-"}
              <AudienceBadge audience={draft.audience} />
              {editLink("niche")}
            </span>
          </Meta>
          <Meta label="Brief">
            <div className="space-y-1">
              <p className="leading-6">{draft.angle || "-"}</p>
              <p className="text-zinc-600">
                Call to action: {draft.callToAction || "-"}
                {editLink("brief")}
              </p>
              {role ? (
                <p className="text-zinc-600">
                  Detected Role: {role.title} at {roleProspect?.name}
                </p>
              ) : null}
            </div>
          </Meta>
          <Meta label="Sequence">
            {sequenceSummary(draft)}
            {editLink("sequence")}
          </Meta>
          <Meta label="Sending">
            <div className="min-w-0">
              <div className="break-words">{mailboxes.map((m) => m.address).join(", ") || "-"}</div>
              <div className="text-zinc-600">
                {formatWeekdays(draft.days)}, {draft.start} to {draft.end}, recipient&apos;s time zone
                {editLink("sending")}
              </div>
            </div>
          </Meta>
          <Meta label="Autonomy">
            {draft.autonomy === "review_first_n" ? `Review the first ${draft.reviewFirstN} emails` : AUTONOMY_LABELS[draft.autonomy]}
            {editLink("autonomy")}
          </Meta>
          <Meta label="Recipients">
            {draft.selected.length} {draft.selected.length === 1 ? "person" : "people"}
            {draft.autoAdd ? `, plus newly Enriched people at Signal Strength ${draft.autoAddMin} or more` : ""}
            {editLink("recipients")}
          </Meta>
        </dl>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Drafts for three recipients</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Written by the Outreach Agent from your Brief, each recipient&apos;s Signals and your Voice Profile. Every email carries its footer.
            </p>
          </div>
          {drafts.length > 0 ? (
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-100/80 p-0.5" role="tablist">
              {drafts.map((d, i) => (
                <button
                  key={`${d.person.kind}:${d.person.id}`}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  onClick={() => setTab(i)}
                  className={cx(
                    "h-7 shrink-0 whitespace-nowrap rounded px-2.5 text-[13px] font-medium",
                    i === tab ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900",
                  )}
                >
                  {d.personLabel}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-3">
          {sample.status === "loading" ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : sample.status === "error" ? (
            <Callout tone="danger" title="The Outreach Agent could not draft the sample emails">
              {sample.error}
            </Callout>
          ) : !active ? (
            <Callout tone="info">There is nobody to draft for yet. Select recipients to see their drafts.</Callout>
          ) : (
            <div className="space-y-3">
              {draft.selected.length === 0 ? (
                <Callout tone="info">No recipient selected: these drafts use Enriched people of the Niche to show what the emails will look like.</Callout>
              ) : null}
              {active.messages.map((m, i) => (
                <EmailCard
                  key={m.id}
                  message={m}
                  to={active.toAddress}
                  toName={active.personLabel}
                  status={i === 0 ? "Day 0, when the recipient joins" : `Day ${dayLabels[i] ?? "-"}, only if no reply`}
                />
              ))}
              {draft.audience === "candidates" ? (
                <ShieldNote>
                  The first email to a Candidate carries the Article 14 Notice: who you are, where their data came from, and how to access, export or delete it.
                </ShieldNote>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
