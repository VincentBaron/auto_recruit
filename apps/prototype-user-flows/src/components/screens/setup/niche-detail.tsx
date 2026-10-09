"use client";

// /niches/[id]: Niche Profile review and edit (targets, candidate profile, Fit threshold, Signal weights),
// schedule and per-run volumes, switch agents on / pause, and "Launch free Test Run" when not used.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building, Check, Compass, Gauge, Pencil, Users, Waypoints } from "lucide-react";
import { formatCredits, formatDate } from "@/lib/format";
import type { ClientState, Niche, SignalWeight } from "@/lib/types";
import { act, useAppState, useBackendError } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { PriceHint } from "@/components/ui/price-hint";
import { DeleteNicheCard, DeleteNicheDialog } from "./niche-delete";
import { diff, editableFrom, isSame, validate, type Editable } from "./niche-editable";
import { ActivityCard, AgentsCard, ScheduleCard, TestRunCard, scheduleCost } from "./niche-side-cards";
import { PAID_TEST_RUN_MAX, nextTestRun } from "./next-test-run";
import {
  FUNDING_STAGE_OPTIONS,
  LOCATION_OPTIONS,
  ROLE_OPTIONS,
  SECTOR_OPTIONS,
  SENIORITY_OPTIONS,
  SIZE_PRESETS,
  scheduleText,
} from "./options";
import { NicheStatusBadge, NotSignedIn, OnboardingSteps, PageSkeleton } from "./shared";
import { SignalWeightsTable } from "./signal-weights-table";
import {
  Avatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ChipInput,
  EmptyState,
  ErrorText,
  Field,
  KeyValue,
  Modal,
  ToggleChips,
  cx,
  inputBaseClass,
  textareaClass,
} from "./ui";
import { useBeforeUnload, useLinkInterceptor } from "./unsaved-guard";

type ModalKind = "activate" | "paidTestRun" | "delete" | "leave" | null;
type Busy = "launch" | "activate" | "pause" | "delete" | null;

const EYEBROW = (
  <span className="inline-flex items-center gap-1.5">
    <Link href="/niches" className="hover:text-zinc-900">
      Niches
    </Link>
    <span className="text-zinc-300">/</span>
    <span>Niche Profile</span>
  </span>
);

function onboardingStep(niche: Niche, isFreeTrial: boolean): number {
  if (!niche.setupComplete) return 0;
  if (!niche.testRun) return 1;
  if (niche.testRun.status === "running") return 2;
  return isFreeTrial ? 3 : 4;
}

function FitThresholdCard({
  state,
  nicheId,
  threshold,
  onChange,
}: {
  state: ClientState;
  nicheId: string;
  threshold: number;
  onChange: (value: number) => void;
}) {
  const prospects = state.prospects.filter((p) => p.nicheIds.includes(nicheId) && p.status !== "dismissed");
  const candidates = state.candidates.filter((c) => c.nicheIds.includes(nicheId) && c.lifecycle !== "dismissed");
  const pAbove = prospects.filter((p) => p.fit.score >= threshold).length;
  const cAbove = candidates.filter((c) => c.fit.score >= threshold).length;
  return (
    <Card>
      <CardHeader
        title="Fit threshold"
        icon={<Gauge />}
        description="How closely a Prospect or Candidate must match this Niche Profile to be Surfaced, regardless of timing. The Feed then ranks by Signal Strength."
      />
      <CardBody>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-label="Fit threshold"
              className="h-2 w-full cursor-pointer accent-indigo-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>0 · broad</span>
              <span>50</span>
              <span>100 · exact matches only</span>
            </div>
          </div>
          <div className="flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
            <span className="text-lg font-semibold leading-none tabular-nums text-zinc-900">{threshold}</span>
            <span className="mt-0.5 text-[10px] text-zinc-400">of 100</span>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-zinc-600">
          {prospects.length + candidates.length === 0 ? (
            "Nothing Surfaced for this Niche yet: the Test Run shows what this threshold lets through."
          ) : (
            <>
              At <span className="font-medium tabular-nums text-zinc-900">{threshold}</span>,{" "}
              <span className="font-medium tabular-nums text-zinc-900">
                {pAbove} of {prospects.length}
              </span>{" "}
              Prospects and{" "}
              <span className="font-medium tabular-nums text-zinc-900">
                {cAbove} of {candidates.length}
              </span>{" "}
              Candidates currently in this Niche stay above it.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

export function NicheDetail({ nicheId }: { nicheId: string }) {
  const state = useAppState();
  const backendError = useBackendError();
  const router = useRouter();
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  /** Where an intercepted link was going while the Niche had unsaved changes. */
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const dropDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const niche = state?.niches.find((n) => n.id === nicheId) ?? null;
  const server = useMemo(() => (niche ? editableFrom(niche) : null), [niche]);
  const value = draft ?? server;
  const dirty = Boolean(draft && server && !isSame(draft, server));
  const unsaved = dirty || saving;

  useEffect(() => {
    if (draft && server && !saving && isSame(draft, server)) setDraft(null);
  }, [draft, server, saving]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2400);
    return () => clearTimeout(t);
  }, [savedFlash]);

  useEffect(
    () => () => {
      if (dropDraftTimer.current) clearTimeout(dropDraftTimer.current);
    },
    [],
  );

  // Unsaved changes: the browser asks before a reload or tab close, and in-app links ask first.
  useBeforeUnload(unsaved);
  useLinkInterceptor(unsaved, (href) => {
    setLeaveTo(href);
    setError(null);
    setModal("leave");
  });

  // Anchors such as #schedule (linked from the Test Run screen) exist only once the state has loaded.
  const loaded = niche !== null;
  useEffect(() => {
    if (!loaded) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const edit = useCallback(
    (fn: (e: Editable) => Editable) => {
      setDraft((prev) => {
        const base = prev ?? (niche ? editableFrom(niche) : null);
        return base ? fn(base) : prev;
      });
    },
    [niche],
  );

  const closeModal = useCallback(() => {
    setModal(null);
    setError(null);
  }, []);

  if (state === null) return backendError ? <BackendErrorState error={backendError} /> : <PageSkeleton />;
  if (busy === "delete" && !niche) return <PageSkeleton />;
  if (!state.session.signedIn || !state.workspace) return <NotSignedIn eyebrow={EYEBROW} title="Niche Profile" what="set up and review your Niches" />;
  if (!niche || !value || !server) {
    return (
      <PageContainer>
        <PageHeader eyebrow={EYEBROW} title="Niche not found" />
        <EmptyState
          icon={<Compass />}
          title="This Niche does not exist"
          description="It may have been deleted, or the simulator was reset."
          actions={<ButtonLink href="/niches">Back to Niches</ButtonLink>}
        />
      </PageContainer>
    );
  }

  const free = state.derived.isFreeTrial;
  const owner = state.recruiters.find((r) => r.id === niche.ownerId);
  const problem = validate(value);
  const testRunBlocked = !niche.setupComplete ? "Finish the Niche setup first." : problem;
  const hasLiveNiche = state.niches.some((n) => n.id !== niche.id && (n.status === "active" || n.status === "paused"));
  const showOnboarding = !hasLiveNiche && (niche.status === "draft" || niche.status === "testing");
  const cost = scheduleCost(value.schedule);
  const p = value.profile;

  const setProfile = <K extends keyof Editable["profile"]>(key: K, v: Editable["profile"][K]) =>
    edit((e) => ({ ...e, profile: { ...e.profile, [key]: v } }));

  const setWeight = (type: SignalWeight["type"], patch: Partial<SignalWeight>) =>
    edit((e) => ({ ...e, profile: { ...e.profile, signalWeights: e.profile.signalWeights.map((w) => (w.type === type ? { ...w, ...patch } : w)) } }));

  const save = async (): Promise<boolean> => {
    if (!draft || !dirty) return true;
    const issue = validate(draft);
    if (issue) {
      setError(issue);
      return false;
    }
    setError(null);
    setSaving(true);
    const d = diff(server, draft);
    if (d.name) {
      const r = await act("updateNiche", { nicheId, name: d.name });
      if (!r.ok) {
        setSaving(false);
        setError(r.error);
        return false;
      }
    }
    if (d.profile) {
      const r = await act("updateNicheProfile", { nicheId, profile: d.profile });
      if (!r.ok) {
        setSaving(false);
        setError(r.error);
        return false;
      }
    }
    if (d.schedule) {
      const r = await act("setSchedule", { nicheId, schedule: d.schedule });
      if (!r.ok) {
        setSaving(false);
        setError(r.error);
        return false;
      }
    }
    const saved = draft;
    setSaving(false);
    setSavedFlash(true);
    setEditingName(false);
    // Fallback if the server normalised a value: drop the draft once the refreshed state has landed.
    if (dropDraftTimer.current) clearTimeout(dropDraftTimer.current);
    dropDraftTimer.current = setTimeout(() => setDraft((cur) => (cur === saved ? null : cur)), 2500);
    return true;
  };

  const discard = () => {
    setDraft(null);
    setError(null);
    setEditingName(false);
  };

  const leave = async (saveFirst: boolean) => {
    if (!leaveTo) return;
    if (saveFirst) {
      if (!(await save())) return;
    } else {
      discard();
    }
    setModal(null);
    router.push(leaveTo);
  };

  const launchTestRun = async () => {
    if (!(await save())) return;
    setBusy("launch");
    const r = await act("launchTestRun", { nicheId });
    if (!r.ok) {
      setBusy(null);
      setError(r.error);
      return;
    }
    router.push(`/niches/${nicheId}/test-run`);
  };

  const activate = async () => {
    if (!(await save())) return;
    setBusy("activate");
    const r = await act("activateNiche", { nicheId });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setModal(null);
  };

  const pause = async () => {
    setBusy("pause");
    const r = await act("pauseNiche", { nicheId });
    setBusy(null);
    if (!r.ok) setError(r.error);
  };

  const remove = async () => {
    setBusy("delete");
    const r = await act("deleteNiche", { nicheId });
    if (!r.ok) {
      setBusy(null);
      setError(r.error);
      return;
    }
    router.push("/niches");
  };

  return (
    <PageContainer>
      {showOnboarding ? (
        <OnboardingSteps
          current={onboardingStep(niche, free)}
          done={free ? [] : [3]}
          freeTestRun={niche.testRun ? niche.testRun.free : nextTestRun(state).free}
        />
      ) : null}

      <PageHeader
        eyebrow={EYEBROW}
        title={
          editingName ? (
            <input
              autoFocus
              value={value.name}
              onChange={(e) => edit((x) => ({ ...x, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
              }}
              onBlur={() => setEditingName(false)}
              aria-label="Niche name"
              className={cx(inputBaseClass, "h-9 w-full max-w-xl text-lg font-semibold")}
            />
          ) : (
            <span className="inline-flex items-start gap-2">
              <span>{value.name || "Untitled Niche"}</span>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label="Rename Niche"
                className="mt-0.5 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </span>
          )
        }
        description={
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <NicheStatusBadge status={niche.status} />
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
              <Avatar name={owner?.name ?? "?"} size="xs" />
              Owned by {owner?.name ?? "an unknown Recruiter"}
            </span>
            <span className="text-xs text-zinc-400" aria-hidden>
              ·
            </span>
            <span className="text-xs text-zinc-500">{scheduleText(server.schedule)}</span>
            <span className="text-xs text-zinc-400" aria-hidden>
              ·
            </span>
            <span className="text-xs text-zinc-500">Created {formatDate(niche.createdOn)}</span>
          </div>
        }
        actions={
          savedFlash && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Check className="size-3.5" aria-hidden />
              Saved
            </span>
          ) : null
        }
      />

      {!niche.setupComplete ? (
        <Callout
          tone="warning"
          className="mb-6"
          title="The setup agent still needs a few answers"
          actions={
            <ButtonLink href={`/onboarding/niche?niche=${niche.id}`} size="sm" variant="primary">
              Continue setup
            </ButtonLink>
          }
        >
          Finish the conversation or the wizard to complete the draft. The Test Run and the agents need a complete Niche Profile.
        </Callout>
      ) : null}
      {niche.status === "testing" && free && niche.testRun?.status === "done" ? (
        <Callout
          tone="info"
          className="mb-6"
          title="Your Test Run is done"
          actions={
            <>
              <ButtonLink href={`/niches/${niche.id}/test-run`} size="sm">
                Open results
              </ButtonLink>
              <ButtonLink href="/credits" size="sm" variant="primary">
                Buy Credits
              </ButtonLink>
            </>
          }
        >
          Buy Credits to reveal the Hiring Contacts and Candidates behind the Previews and switch the agents on for this Niche.
        </Callout>
      ) : null}
      {error && !dirty && modal === null ? (
        <Callout tone="danger" className="mb-6" title="That did not work">
          {error}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Target companies" icon={<Building />} description="Which Prospects the Prospection Agent looks for." />
            <CardBody className="grid gap-5 md:grid-cols-2">
              <Field label="Sectors" className="md:col-span-2">
                <ChipInput values={p.sectors} onChange={(v) => setProfile("sectors", v)} options={SECTOR_OPTIONS} ariaLabel="Sectors" placeholder="Add a sector" />
              </Field>
              <Field label="Company size (people)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    aria-label="Minimum company size"
                    className={cx(inputBaseClass, "h-8 w-24 text-sm tabular-nums")}
                    value={p.companySize.min}
                    onChange={(e) => e.target.value !== "" && setProfile("companySize", { ...p.companySize, min: Number(e.target.value) })}
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    type="number"
                    min={2}
                    aria-label="Maximum company size"
                    className={cx(inputBaseClass, "h-8 w-24 text-sm tabular-nums")}
                    value={p.companySize.max}
                    onChange={(e) => e.target.value !== "" && setProfile("companySize", { ...p.companySize, max: Number(e.target.value) })}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {SIZE_PRESETS.map((s) => {
                    const on = p.companySize.min === s.min && p.companySize.max === s.max;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setProfile("companySize", { min: s.min, max: s.max })}
                        className={cx(
                          "h-6 rounded-md border px-2 text-[11px] tabular-nums",
                          on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Funding stages" hint="None selected means any stage.">
                <ToggleChips options={FUNDING_STAGE_OPTIONS} values={p.fundingStages} onChange={(v) => setProfile("fundingStages", v)} ariaLabel="Funding stages" />
              </Field>
              <Field label="Locations" className="md:col-span-2">
                <ChipInput values={p.locations} onChange={(v) => setProfile("locations", v)} options={LOCATION_OPTIONS} ariaLabel="Locations" placeholder="Add a location" />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Target roles and Candidates" icon={<Users />} description="The roles you place, and who the Sourcing Agent looks for." />
            <CardBody className="space-y-5">
              <Field label="Role types">
                <ChipInput values={p.roleTypes} onChange={(v) => setProfile("roleTypes", v)} options={ROLE_OPTIONS} ariaLabel="Role types" placeholder="Add a role type" />
              </Field>
              <Field label="Seniority">
                <ToggleChips options={SENIORITY_OPTIONS} values={p.seniority} onChange={(v) => setProfile("seniority", v)} ariaLabel="Seniority" />
              </Field>
              <Field label="Candidate profile" htmlFor="nd-cand" hint="What makes a Candidate a good Fit beyond the title. The agents judge Fit against it.">
                <textarea id="nd-cand" rows={4} className={textareaClass} value={p.candidateProfile} onChange={(e) => setProfile("candidateProfile", e.target.value)} />
              </Field>
            </CardBody>
          </Card>

          <FitThresholdCard state={state} nicheId={niche.id} threshold={p.fitThreshold} onChange={(v) => setProfile("fitThreshold", v)} />

          <Card>
            <CardHeader
              title="Signal weights"
              icon={<Waypoints />}
              description="Each Signal adds its weight, halved every half-life as it ages. Negative Signals count against."
            />
            <SignalWeightsTable weights={p.signalWeights} onChange={setWeight} />
            <div className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-700">Signal Strength</span> = sum of weight x 0.5
              <sup>age in days / half-life</sup>, clamped to 0-100. Every score in the Feed shows this calculation line by line.
            </div>
          </Card>

          <Card>
            <CardHeader title="Search strategy" icon={<Compass />} description="The queries the agents run, rebuilt from the Niche Profile when you save." />
            <CardBody>
              {niche.profile.searchStrategy.length === 0 ? (
                <p className="text-sm text-zinc-500">Built when the Niche Profile draft is complete.</p>
              ) : (
                <ol className="space-y-2">
                  {niche.profile.searchStrategy.map((q, i) => (
                    <li key={q} className="flex gap-2.5 text-[13px] leading-snug text-zinc-700">
                      <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[11px] font-semibold tabular-nums text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="min-w-0">{q}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          {niche.status === "draft" || niche.status === "testing" ? (
            <>
              <TestRunCard
                niche={niche}
                state={state}
                onLaunchFree={launchTestRun}
                onLaunchPaid={() => setModal("paidTestRun")}
                launching={busy === "launch"}
                blocked={testRunBlocked}
              />
              <AgentsCard
                niche={niche}
                state={state}
                schedule={value.schedule}
                onActivate={() => setModal("activate")}
                onPause={pause}
                busy={busy === "pause" || busy === "activate"}
              />
            </>
          ) : (
            <>
              <AgentsCard
                niche={niche}
                state={state}
                schedule={value.schedule}
                onActivate={() => setModal("activate")}
                onPause={pause}
                busy={busy === "pause" || busy === "activate"}
              />
              <TestRunCard
                niche={niche}
                state={state}
                onLaunchFree={launchTestRun}
                onLaunchPaid={() => setModal("paidTestRun")}
                launching={busy === "launch"}
                blocked={testRunBlocked}
              />
            </>
          )}
          <ScheduleCard schedule={value.schedule} onChange={(s) => edit((e) => ({ ...e, schedule: s }))} />
          <ActivityCard niche={niche} state={state} />
          <DeleteNicheCard
            state={state}
            niche={niche}
            onDelete={() => {
              setError(null);
              setModal("delete");
            }}
            onPause={pause}
            pausing={busy === "pause"}
          />
        </aside>
      </div>

      {dirty || saving ? (
        <div className="sticky bottom-16 z-30 mt-6">
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-lg shadow-zinc-900/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900">Unsaved changes to this Niche</div>
              {error ? <ErrorText>{error}</ErrorText> : <div className="text-xs text-zinc-500">Fit and Signal Strength in the Feed are recomputed when you save.</div>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" disabled={saving} onClick={discard}>
                Discard
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()} disabled={problem !== null && !saving}>
                Save changes
              </Button>
            </div>
          </div>
          {problem && !error ? <p className="mt-1.5 px-1 text-xs text-amber-700">{problem}</p> : null}
        </div>
      ) : null}

      <Modal
        open={modal === "activate"}
        onClose={closeModal}
        title={niche.status === "paused" ? "Switch the agents on again?" : "Switch the agents on?"}
        description={`The Prospection and Sourcing Agents run ${scheduleText(value.schedule)} and surface only items with a Fit of ${p.fitThreshold} or more.`}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "activate" || saving} disabled={value.schedule.days.length === 0} onClick={() => void activate()}>
              Switch on · up to {formatCredits(cost.perWeek)} Credits a week
            </Button>
          </>
        }
      >
        <div className="rounded-lg border border-zinc-200 px-3 py-1.5">
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-zinc-700">Maximum Credits</span>
            <PriceHint />
          </div>
          <dl className="divide-y divide-zinc-100">
            <KeyValue label={`Per run (${value.schedule.prospectsPerRun} Prospects, their Hiring Contacts, ${value.schedule.candidatesPerRun} Candidates)`} value={formatCredits(cost.total)} />
            <KeyValue label={`Per week (${value.schedule.days.length} runs)`} value={formatCredits(cost.perWeek)} strong />
            <KeyValue label="Current balance" value={formatCredits(state.workspace.credits)} />
          </dl>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Runs stop cleanly when Credits run out
          {state.workspace.autoTopUp.enabled ? `, unless auto top-up adds ${formatCredits(state.workspace.autoTopUp.packCredits)} Credits first` : ""}. Nobody is contacted: Enrichment and Campaigns stay your decision.
        </p>
        {value.schedule.days.length === 0 ? <p className="mt-2 text-xs text-amber-700">Pick at least one run day in the schedule first.</p> : null}
        {dirty ? <p className="mt-2 text-xs text-zinc-500">Your unsaved changes are saved first.</p> : null}
        {error ? (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modal === "paidTestRun"}
        onClose={closeModal}
        title="Launch a Test Run?"
        description="10 Prospects and 10 Candidates for you to label good or bad, about 6 seconds."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "launch" || saving} onClick={() => void launchTestRun()}>
              Launch · up to {PAID_TEST_RUN_MAX} Credits
            </Button>
          </>
        }
      >
        <div className="rounded-lg border border-zinc-200 px-3 py-1.5">
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-zinc-700">Cost</span>
            <PriceHint />
          </div>
          <dl className="divide-y divide-zinc-100">
            <KeyValue label="10 Surfaced Prospects" value="10" />
            <KeyValue label="10 Surfaced Candidates" value="10" />
            <KeyValue label="Hiring Contacts found (1 to 2 per Prospect)" value="up to 20" />
            <KeyValue label="Total, at most" value={`${PAID_TEST_RUN_MAX} Credits`} strong />
            <KeyValue label="Current balance" value={formatCredits(state.workspace.credits)} />
          </dl>
        </div>
        {niche.testRun ? <p className="mt-3 text-xs text-zinc-500">The new results replace those of the Test Run from {formatDate(niche.testRun.completedOn ?? niche.testRun.startedOn)}.</p> : null}
        {dirty ? <p className="mt-2 text-xs text-zinc-500">Your unsaved changes are saved first.</p> : null}
        {error ? (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        ) : null}
      </Modal>

      {modal === "delete" ? (
        <DeleteNicheDialog state={state} niche={niche} onClose={closeModal} onConfirm={() => void remove()} busy={busy === "delete"} error={error} />
      ) : null}

      <Modal
        open={modal === "leave"}
        onClose={closeModal}
        title="Discard unsaved changes?"
        description="Your changes to this Niche are not saved. Leaving this page discards them."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => void leave(false)} disabled={saving}>
              Discard and leave
            </Button>
            {problem === null ? (
              <Button variant="primary" loading={saving} onClick={() => void leave(true)}>
                Save and leave
              </Button>
            ) : null}
          </>
        }
      >
        {problem || error ? (
          <div className="space-y-2">
            {problem ? <p className="text-xs text-amber-700">{problem} Fix it to save, or discard the changes.</p> : null}
            <ErrorText>{error}</ErrorText>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
