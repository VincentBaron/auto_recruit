"use client";

// Variant B "Wizard": a stepped form where the setup agent suggests values from a short description.
// The draft Niche is created on the first Continue and every Continue saves the form to it, and the
// step is in the URL (?step=companies), so a reload or Back / Forward resumes at the same step with
// the saved values. The description itself is kept in this tab's session storage, keyed by Niche.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Check, RotateCcw, Sparkles } from "lucide-react";
import type { ClientState, CompanySizeRange, Niche, NicheProfile, NicheSuggestions } from "@/lib/types";
import { act } from "@/lib/api";
import {
  FUNDING_STAGE_OPTIONS,
  LOCATION_OPTIONS,
  ROLE_OPTIONS,
  SECTOR_OPTIONS,
  SENIORITY_OPTIONS,
  SIZE_PRESETS,
  sizeText,
  stageText,
  suggestNicheName,
} from "./options";
import { NextTestRunNote, PaidTestRunCost, TestRunNextStep, nextTestRun, type NextTestRun } from "./next-test-run";
import { ProfileDraftPanel, ProfileFields, draftFromNiche, type DraftView } from "./profile-draft-panel";
import type { EnsureNiche } from "./setup-chat";
import { Button, ButtonLink, ChipInput, ErrorText, Field, ToggleChips, cx, inputBaseClass, inputClass, textareaClass } from "./ui";
import { useBeforeUnload } from "./unsaved-guard";

interface Form {
  /** Typed on the review step only; empty means the suggested name. */
  name: string;
  sectors: string[];
  companySize: CompanySizeRange;
  fundingStages: string[];
  locations: string[];
  roleTypes: string[];
  seniority: string[];
  candidateProfile: string;
}

const STEPS = [
  { key: "describe", title: "Describe your placements", short: "Describe" },
  { key: "companies", title: "Target companies", short: "Companies" },
  { key: "roles", title: "Roles and Candidates", short: "Roles" },
  { key: "review", title: "Review the draft", short: "Review" },
] as const;

const LAST_STEP = STEPS.length - 1;

const EXAMPLES = [
  "I place senior backend engineers in Series A to C fintechs in Paris, 20 to 300 people",
  "Product designers for healthtech startups, remote across the EU",
  "Data engineers for B2B SaaS scale-ups in Lyon and Bordeaux, 50 to 500 people",
];

/** What a new draft Niche starts from (the dummy backend's empty Niche Profile). */
const EMPTY_FORM: Form = {
  name: "",
  sectors: [],
  companySize: { min: 20, max: 300 },
  fundingStages: [],
  locations: [],
  roleTypes: [],
  seniority: [],
  candidateProfile: "",
};

function formFrom(niche: Niche | null): Form {
  if (!niche) return EMPTY_FORM;
  const p = niche.profile;
  return {
    name: "",
    sectors: [...p.sectors],
    companySize: { ...p.companySize },
    fundingStages: [...p.fundingStages],
    locations: [...p.locations],
    roleTypes: [...p.roleTypes],
    seniority: [...p.seniority],
    candidateProfile: p.candidateProfile,
  };
}

function profilePatch(f: Form): Partial<NicheProfile> {
  return {
    sectors: f.sectors,
    companySize: f.companySize,
    fundingStages: f.fundingStages,
    locations: f.locations,
    roleTypes: f.roleTypes,
    seniority: f.seniority,
    candidateProfile: f.candidateProfile,
  };
}

/** Same Niche Profile fields (the name is only saved when the draft is made). */
function sameProfile(a: Form, b: Form): boolean {
  return JSON.stringify(profilePatch(a)) === JSON.stringify(profilePatch(b));
}

const sizeIsValid = (s: CompanySizeRange) => s.min >= 1 && s.max > s.min;

function stepErrors(step: number, f: Form): string | null {
  if (step === 1) {
    if (f.sectors.length === 0) return "Add at least one sector.";
    if (f.locations.length === 0) return "Add at least one location.";
    if (!sizeIsValid(f.companySize)) return "Company size: the maximum must be above the minimum.";
  }
  if (step === 2) {
    if (f.roleTypes.length === 0) return "Add at least one role type.";
    if (f.candidateProfile.trim().length < 12) return "Describe what makes a Candidate a good Fit (a sentence is enough).";
  }
  return null;
}

/** The furthest step the form allows: the first incomplete step, or the review. */
function furthestStep(f: Form): number {
  for (let s = 1; s < LAST_STEP; s++) if (stepErrors(s, f)) return s;
  return LAST_STEP;
}

function stepFromParam(value: string | null): number {
  const i = STEPS.findIndex((s) => s.key === value);
  return i < 0 ? 0 : i;
}

/* The description is only the input for suggestions: kept per tab, so a reload brings it back. */
const descriptionKey = (nicheId: string) => `auto-recruit:wizard-description:${nicheId}`;

function readDescription(nicheId: string): string {
  try {
    return window.sessionStorage.getItem(descriptionKey(nicheId)) ?? "";
  } catch {
    return "";
  }
}

function storeDescription(nicheId: string, text: string): void {
  try {
    if (text.trim()) window.sessionStorage.setItem(descriptionKey(nicheId), text);
    else window.sessionStorage.removeItem(descriptionKey(nicheId));
  } catch {
    // Storage blocked (private window): the description is simply not kept across reloads.
  }
}

function AgentCard({ children, title = "Setup agent suggestions" }: { children: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50">
      <div className="flex items-center gap-2 border-b border-indigo-100 px-3.5 py-2.5 text-xs font-medium text-indigo-800">
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white">
          <Bot className="size-3" aria-hidden />
        </span>
        {title}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function SuggestionSummary({ s }: { s: NicheSuggestions }) {
  const rows: [string, string][] = [
    ["Niche name", s.name],
    ["Sectors", s.sectors.join(", ")],
    ["Company size", sizeText(s.companySize)],
    ["Funding stages", stageText(s.fundingStages)],
    ["Locations", s.locations.join(", ")],
    ["Role types", s.roleTypes.join(", ")],
    ["Seniority", s.seniority.join(", ")],
    ["Candidate profile", s.candidateProfile],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[120px_minmax(0,1fr)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-indigo-900/60 sm:pt-px">{k}</dt>
          <dd className="text-[13px] text-indigo-950 [overflow-wrap:anywhere]">{v || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

type Pending = "suggest" | "apply" | "without" | "skip" | "continue" | "jump" | "draft" | null;

function WizardForm({ state, niche, ensureNiche }: { state: ClientState; niche: Niche | null; ensureNiche: EnsureNiche }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [form, setForm] = useState<Form>(() => formFrom(niche));
  const [description, setDescription] = useState(() => niche?.setupMessages.find((m) => m.role === "recruiter")?.text ?? "");
  const [suggestions, setSuggestions] = useState<NicheSuggestions | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The step comes from the URL. Without a draft Niche only the description exists, and a step is
  // never shown before the steps it depends on are complete (an edited or stale URL).
  const requested = stepFromParam(params.get("step"));
  const step = niche ? Math.min(requested, furthestStep(form)) : 0;
  const currentError = stepErrors(step, form);
  const suggestedName = suggestNicheName(form);
  const busy = pending !== null;

  const saved = formFrom(niche);
  const unsaved = !sameProfile(form, saved) || form.name.trim() !== "" || (!niche && description.trim() !== "");
  useBeforeUnload(unsaved && pending !== "draft");

  // Bring back the description typed before a reload (and the suggestions made from it), then keep
  // it in session storage while it changes.
  const nicheId = niche?.id ?? null;
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!nicheId) return;
    if (restoredFor.current !== nicheId) {
      restoredFor.current = nicheId;
      const stored = readDescription(nicheId);
      if (stored && !description.trim()) {
        setDescription(stored);
        void act("suggestNicheFields", { description: stored }).then((res) => {
          if (res.ok && alive.current) setSuggestions((s) => s ?? res.result);
        });
        return;
      }
    }
    storeDescription(nicheId, description);
  }, [nicheId, description]);

  // A new step starts at the top of the wizard when the previous one was scrolled past.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const el = rootRef.current;
    if (!el) return;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top < margin) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const urlFor = (target: number, id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("niche", id);
    if (target === 0) sp.delete("step");
    else sp.set("step", STEPS[target].key);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  /** Creates the draft Niche if needed and saves the form to it. Returns its id, or null on error. */
  const persist = async (next: Form): Promise<string | null> => {
    setError(null);
    const created = await ensureNiche();
    if (!created.ok) {
      setError(created.error);
      return null;
    }
    storeDescription(created.id, description);
    // An invalid size is not sent: the "Target companies" step asks to fix it first.
    if (!sameProfile(next, saved) && sizeIsValid(next.companySize)) {
      const res = await act("updateNicheProfile", { nicheId: created.id, profile: profilePatch(next) });
      if (!res.ok) {
        setError(res.error);
        return null;
      }
    }
    return created.id;
  };

  /** Moves to `target`: back freely, forward only through complete steps, saving first. */
  const navigate = async (target: number, via: Exclude<Pending, null>, next: Form = form) => {
    if (busy) return;
    if (target <= step) {
      setShowErrors(false);
      setError(null);
      router.push(urlFor(target, nicheId), { scroll: false });
      return;
    }
    let stop = target;
    for (let s = Math.max(step, 1); s < target; s++) {
      if (stepErrors(s, next)) {
        stop = s;
        break;
      }
    }
    if (stop === step) {
      setShowErrors(true);
      return;
    }
    setPending(via);
    const id = await persist(next);
    if (!alive.current) return;
    setPending(null);
    if (!id) return;
    setShowErrors(stop < target);
    router.push(urlFor(stop, id), { scroll: false });
  };

  const askSuggestions = async () => {
    if (description.trim().length < 10) return setError("Write a sentence or two about the placements you make.");
    setError(null);
    setPending("suggest");
    const res = await act("suggestNicheFields", { description: description.trim() });
    if (!alive.current) return;
    setPending(null);
    if (!res.ok) return setError(res.error);
    setSuggestions(res.result);
  };

  const applySuggestions = () => {
    if (!suggestions) return;
    // The name stays empty: the review step suggests it from these values, with the same rule.
    const next: Form = {
      name: "",
      sectors: [...suggestions.sectors],
      companySize: { ...suggestions.companySize },
      fundingStages: [...suggestions.fundingStages],
      locations: [...suggestions.locations],
      roleTypes: [...suggestions.roleTypes],
      seniority: [...suggestions.seniority],
      candidateProfile: suggestions.candidateProfile,
    };
    setForm(next);
    void navigate(1, "apply", next);
  };

  const draftProfile = async () => {
    if (busy) return;
    for (const s of [1, 2]) {
      if (stepErrors(s, form)) {
        router.push(urlFor(s, nicheId), { scroll: false });
        setShowErrors(true);
        return;
      }
    }
    setPending("draft");
    const id = await persist(form);
    if (!id) {
      if (alive.current) setPending(null);
      return;
    }
    const res = await act("draftNicheProfile", {
      nicheId: id,
      input: {
        name: form.name.trim() || suggestedName,
        sectors: form.sectors,
        companySize: form.companySize,
        fundingStages: form.fundingStages,
        locations: form.locations,
        roleTypes: form.roleTypes,
        seniority: form.seniority,
        candidateProfile: form.candidateProfile.trim(),
      },
    });
    if (!res.ok) {
      if (alive.current) {
        setPending(null);
        setError(res.error);
      }
      return;
    }
    // The refreshed state shows the drafted Niche (this form unmounts): drop the step from the URL.
    storeDescription(id, "");
    router.replace(urlFor(0, id), { scroll: false });
  };

  const reviewDraft: DraftView = {
    name: form.name.trim() || suggestedName,
    sectors: form.sectors,
    companySize: form.companySize,
    fundingStages: form.fundingStages,
    locations: form.locations,
    roleTypes: form.roleTypes,
    seniority: form.seniority,
    candidateProfile: form.candidateProfile,
    fitThreshold: null,
    signalWeights: null,
    searchStrategy: [],
  };

  return (
    <div ref={rootRef} className="grid scroll-mt-[calc(var(--chrome-h)+1rem)] gap-4 sm:gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
      <nav aria-label="Wizard steps" className="min-w-0">
        {/* Below sm: "Step 1 of 4 - Describe" and a progress bar, like the Campaign wizard. */}
        <div className="sm:hidden">
          <div className="text-xs tabular-nums text-zinc-500">
            Step {step + 1} of {STEPS.length} - <span className="font-medium text-zinc-800">{STEPS[step].short}</span>
          </div>
          <div className="mt-2 flex gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === step ? "step" : undefined}
                disabled={busy}
                onClick={() => void navigate(i, "jump")}
                className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-indigo-600" : "bg-zinc-200")}
              />
            ))}
          </div>
        </div>
        <ol className="hidden gap-1 sm:flex lg:flex-col lg:gap-0.5">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => void navigate(i, "jump")}
                  disabled={busy && !current}
                  aria-current={current ? "step" : undefined}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    current ? "bg-white font-medium text-zinc-900 shadow-xs ring-1 ring-zinc-200" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
                  )}
                >
                  <span
                    className={cx(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                      current ? "bg-indigo-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500",
                    )}
                  >
                    {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className="hidden lg:inline">{s.title}</span>
                  <span className="lg:hidden">{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 hidden px-2.5 text-xs leading-relaxed text-zinc-500 lg:block">
          The setup agent suggests values from your description. You approve every field before anything runs.
        </p>
      </nav>

      <section className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-xs">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <div className="hidden text-xs text-zinc-500 tabular-nums sm:block">
            Step {step + 1} of {STEPS.length}
          </div>
          <h2 className="text-[15px] font-semibold text-zinc-900">{STEPS[step].title}</h2>
        </div>

        <div className="space-y-5 px-5 py-5">
          {step === 0 ? (
            <>
              <Field
                label="In a few lines: sectors, roles, locations, seniority, company size"
                htmlFor="wz-desc"
                hint="The setup agent turns it into suggested values for the next steps."
              >
                <textarea
                  id="wz-desc"
                  rows={4}
                  className={textareaClass}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="I place senior backend engineers in Series A to C fintechs in Paris..."
                />
              </Field>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-xs text-zinc-500">Examples</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDescription(ex)}
                    className="max-w-full rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-left text-xs text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                  >
                    <span className="line-clamp-1">{ex}</span>
                  </button>
                ))}
              </div>
              {suggestions ? (
                <AgentCard>
                  <SuggestionSummary s={suggestions} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={applySuggestions} loading={pending === "apply"} disabled={busy}>
                      Use suggestions and continue
                      {pending !== "apply" ? <ArrowRight aria-hidden /> : null}
                    </Button>
                    <Button variant="ghost" onClick={() => void navigate(1, "without")} loading={pending === "without"} disabled={busy}>
                      Continue without them
                    </Button>
                  </div>
                </AgentCard>
              ) : null}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field label="Sectors">
                <ChipInput
                  values={form.sectors}
                  onChange={(v) => set("sectors", v)}
                  options={SECTOR_OPTIONS}
                  suggested={suggestions?.sectors ?? []}
                  placeholder="Fintech, Payments..."
                  ariaLabel="Sectors"
                />
              </Field>
              <Field label="Company size (people)" hint="Prospects outside this range get a lower Fit.">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    aria-label="Minimum company size"
                    className={cx(inputBaseClass, "h-8 w-24 text-sm tabular-nums")}
                    value={form.companySize.min}
                    onChange={(e) => set("companySize", { ...form.companySize, min: Number(e.target.value) })}
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    type="number"
                    min={2}
                    aria-label="Maximum company size"
                    className={cx(inputBaseClass, "h-8 w-24 text-sm tabular-nums")}
                    value={form.companySize.max}
                    onChange={(e) => set("companySize", { ...form.companySize, max: Number(e.target.value) })}
                  />
                  <span className="mx-1 hidden h-4 w-px bg-zinc-200 sm:block" aria-hidden />
                  {SIZE_PRESETS.map((p) => {
                    const on = form.companySize.min === p.min && form.companySize.max === p.max;
                    const hinted = !on && suggestions?.companySize.min === p.min && suggestions.companySize.max === p.max;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => set("companySize", { min: p.min, max: p.max })}
                        className={cx(
                          "h-7 rounded-md border px-2 text-xs tabular-nums",
                          on
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : hinted
                              ? "border-dashed border-indigo-300 text-indigo-600"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Funding stages" hint="None selected means any stage.">
                <ToggleChips
                  options={FUNDING_STAGE_OPTIONS}
                  values={form.fundingStages}
                  onChange={(v) => set("fundingStages", v)}
                  suggested={suggestions?.fundingStages ?? []}
                  ariaLabel="Funding stages"
                />
              </Field>
              <Field label="Locations">
                <ChipInput
                  values={form.locations}
                  onChange={(v) => set("locations", v)}
                  options={LOCATION_OPTIONS}
                  suggested={suggestions?.locations ?? []}
                  placeholder="Paris, Remote EU..."
                  ariaLabel="Locations"
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label="Role types you place">
                <ChipInput
                  values={form.roleTypes}
                  onChange={(v) => set("roleTypes", v)}
                  options={ROLE_OPTIONS}
                  suggested={suggestions?.roleTypes ?? []}
                  placeholder="Backend Engineer..."
                  ariaLabel="Role types"
                />
              </Field>
              <Field label="Seniority">
                <ToggleChips
                  options={SENIORITY_OPTIONS}
                  values={form.seniority}
                  onChange={(v) => set("seniority", v)}
                  suggested={suggestions?.seniority ?? []}
                  ariaLabel="Seniority"
                />
              </Field>
              <Field
                label="Candidate profile"
                htmlFor="wz-cand"
                hint="What makes a Candidate a good Fit beyond the title: years, stack, industries they come from."
              >
                <textarea
                  id="wz-cand"
                  rows={4}
                  className={textareaClass}
                  value={form.candidateProfile}
                  onChange={(e) => set("candidateProfile", e.target.value)}
                  placeholder="5+ years building backend systems in Go or Kotlin, ideally from payments..."
                />
              </Field>
              {suggestions && suggestions.candidateProfile !== form.candidateProfile ? (
                <AgentCard title="Suggested Candidate profile">
                  <p className="text-[13px] leading-relaxed text-indigo-950">{suggestions.candidateProfile}</p>
                  <Button className="mt-3" size="sm" onClick={() => set("candidateProfile", suggestions.candidateProfile)}>
                    <Sparkles aria-hidden />
                    Use this
                  </Button>
                </AgentCard>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Field label="Niche name" htmlFor="wz-name" hint="Shown in the Feed filter, Campaigns and the Digest.">
                <input
                  id="wz-name"
                  className={inputClass}
                  value={form.name}
                  placeholder={suggestedName}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <div className="rounded-lg border border-zinc-200 px-3 pb-2">
                <ProfileFields draft={reviewDraft} pending={["fitThreshold", "signalWeights", "searchStrategy"]} highlighted={[]} />
              </div>
              <p className="text-xs text-zinc-500">
                Drafting builds the search strategy and starts from default Signal weights and a Fit threshold of 60. You can tune all of it on the next screen.
              </p>
            </>
          ) : null}

          {(showErrors || requested > step) && currentError ? <ErrorText>{currentError}</ErrorText> : null}
          <ErrorText>{error}</ErrorText>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => void navigate(step - 1, "jump")} disabled={busy}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          ) : (
            <span />
          )}
          {step === 0 ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => void navigate(1, "skip")} loading={pending === "skip"} disabled={busy}>
                Skip, fill in myself
              </Button>
              <Button variant="primary" onClick={askSuggestions} loading={pending === "suggest"} disabled={busy || description.trim().length < 10}>
                {pending !== "suggest" ? <Sparkles aria-hidden /> : null}
                {suggestions ? "Suggest again" : "Get suggestions"}
              </Button>
            </div>
          ) : step < LAST_STEP ? (
            <Button variant="primary" onClick={() => void navigate(step + 1, "continue")} loading={pending === "continue"} disabled={busy}>
              Continue
              {pending !== "continue" ? <ArrowRight aria-hidden /> : null}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void draftProfile()} loading={pending === "draft"} disabled={state.workspace === null || (busy && pending !== "draft")}>
              {pending !== "draft" ? <Sparkles aria-hidden /> : null}
              Draft Niche Profile
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

const REVIEW_STEP = { title: "Review Niche Profile", text: "Check the targets, the Fit threshold and the Signal weights the agents rank with." };
const LABEL_STEP = { title: "Label the results", text: "Mark them good or bad; the agents propose Niche Profile adjustments." };
const PAID_TEST_RUN_STEP = {
  title: "Test Run",
  text: (
    <>
      10 Prospects and 10 Candidates for you to label good or bad, <PaidTestRunCost />
    </>
  ),
};

/** From the drafted Niche Profile to the agents running, as this Workspace will go through it. */
function nextSteps(next: NextTestRun): { title: string; text: ReactNode }[] {
  if (next.free) {
    return [
      REVIEW_STEP,
      { title: "Free Test Run", text: "10 Prospects in full, Hiring Contacts and Candidates as Previews. 0\u00a0Credits, once per Main Domain." },
      LABEL_STEP,
      { title: "Buy Credits and switch the agents on", text: "People are revealed at the normal price per person, and the agents run on your schedule." },
    ];
  }
  if (next.needsCredits) {
    return [
      REVIEW_STEP,
      {
        title: "Buy Credits",
        text: (
          <>
            <span className="font-medium [overflow-wrap:anywhere]">{next.usedBy}</span> already used its free Test Run (one per Main Domain), so Test Runs
            are paid in Credits.
          </>
        ),
      },
      PAID_TEST_RUN_STEP,
      { title: "Switch the agents on", text: "Accept the proposed Niche Profile adjustments, then the agents run on your schedule." },
    ];
  }
  return [
    REVIEW_STEP,
    PAID_TEST_RUN_STEP,
    LABEL_STEP,
    { title: "Switch the agents on", text: "The agents run on your schedule and spend Credits per Surfaced Prospect and Candidate." },
  ];
}

function WizardDrafted({ state, niche, onStartNew }: { state: ClientState; niche: Niche; onStartNew: () => void }) {
  const next = nextTestRun(state);
  const rootRef = useRef<HTMLDivElement>(null);
  // Drafting swaps the form for this view at the form's scroll position: bring the confirmation under
  // the chrome at once (the whole view changed, so no smooth scroll). A page opened on a drafted Niche
  // starts at the top and does not move.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top < margin) el.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div ref={rootRef} className="grid scroll-mt-[calc(var(--chrome-h)+1rem)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <Check className="size-4" aria-hidden />
            Your Niche Profile is drafted
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/80 [overflow-wrap:anywhere]">
            &ldquo;{niche.name}&rdquo; is ready for your review. Adjust anything, then <TestRunNextStep next={next} />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/niches/${niche.id}`} variant="primary">
              Review Niche Profile
              <ArrowRight aria-hidden />
            </ButtonLink>
            <Button variant="ghost" onClick={onStartNew}>
              <RotateCcw aria-hidden />
              Start another setup
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-xs">
          <h3 className="text-sm font-semibold text-zinc-900">What happens next</h3>
          <ol className="mt-3 space-y-3">
            {nextSteps(next).map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold tabular-nums text-zinc-600">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-900">{s.title}</span>
                  <span className="block text-[13px] text-zinc-500">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--chrome-h)+1rem)] lg:self-start">
        <ProfileDraftPanel
          draft={draftFromNiche(niche)}
          pending={[]}
          highlighted={[]}
          complete
          footer={<NextTestRunNote next={next} />}
        />
      </div>
    </div>
  );
}

export function SetupWizard({
  state,
  niche,
  ensureNiche,
  onStartNew,
}: {
  state: ClientState;
  niche: Niche | null;
  ensureNiche: EnsureNiche;
  onStartNew: () => void;
}) {
  if (niche?.setupComplete) return <WizardDrafted state={state} niche={niche} onStartNew={onStartNew} />;
  // Not keyed by Niche: the form keeps its values while the first Continue creates the draft Niche.
  return <WizardForm state={state} niche={niche} ensureNiche={ensureNiche} />;
}
