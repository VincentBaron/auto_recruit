// Pure, deterministic derivations for the Test Run and Credits screens (safe during render).

import { addDays, diffDays, weekdayOf } from "@/lib/dates";
import { PRICES, REVEAL_LEDGER_REF } from "@/lib/pricing";
import type {
  Candidate,
  ClientState,
  CreditLedgerEntry,
  ISODate,
  Niche,
  NicheSchedule,
  Preview,
  Prospect,
  SignalType,
  TestRun,
  TestRunItem,
} from "@/lib/types";

/** Results of a Test Run: 10 Prospects and 10 Candidates. */
export const TEST_RUN_PROSPECTS = 10;
export const TEST_RUN_CANDIDATES = 10;
/** The Prospection Agent finds 1 or 2 Hiring Contacts per Prospect in a Test Run. */
export const TEST_RUN_MAX_HIRING_CONTACTS = 20;
/** Labels needed before the agents propose Niche Profile adjustments. */
export const LABELS_FOR_ADJUSTMENTS = 3;
/** Hiring Contacts a scheduled run finds per Surfaced Prospect, at most. */
const MAX_HIRING_CONTACTS_PER_PROSPECT = 3;

export function isFreeTrial(state: ClientState): boolean {
  return state.derived?.isFreeTrial ?? state.workspace?.plan !== "paid";
}

export function freeTestRunAvailable(state: ClientState): boolean {
  return state.derived?.freeTestRunAvailable ?? (state.workspace !== null && state.workspace.freeTestRunUsedBy === null);
}

export interface CostLine {
  label: string;
  detail: string;
  credits: number;
}

export interface TestRunQuote {
  free: boolean;
  maxCredits: number;
  lines: CostLine[];
  /** Why a Test Run cannot be launched now, or null. */
  blocked: string | null;
}

/** What launching a Test Run costs at most, with the same rules as the dummy backend. */
export function testRunQuote(state: ClientState): TestRunQuote {
  const paid = state.workspace?.plan === "paid";
  const free = freeTestRunAvailable(state);
  const mainDomain = state.workspace?.mainDomains[0] ?? null;
  const prospectCredits = free ? 0 : TEST_RUN_PROSPECTS * PRICES.surfacedProspect;
  const lines: CostLine[] = [
    {
      label: `${TEST_RUN_PROSPECTS} Prospects in full`,
      detail: free ? `Free Test Run, once per Main Domain${mainDomain ? ` (${mainDomain})` : ""}` : `${PRICES.surfacedProspect} Credit per Surfaced Prospect`,
      credits: prospectCredits,
    },
    paid
      ? { label: `Up to ${TEST_RUN_MAX_HIRING_CONTACTS} Hiring Contacts`, detail: `${PRICES.hiringContactFound} Credit per Hiring Contact found`, credits: TEST_RUN_MAX_HIRING_CONTACTS * PRICES.hiringContactFound }
      : { label: "Hiring Contacts as Previews", detail: "Anonymised and never stored in the free trial", credits: 0 },
    paid
      ? { label: `${TEST_RUN_CANDIDATES} Candidates`, detail: `${PRICES.surfacedCandidate} Credit per Surfaced Candidate`, credits: TEST_RUN_CANDIDATES * PRICES.surfacedCandidate }
      : { label: `${TEST_RUN_CANDIDATES} Candidates as Previews`, detail: "Anonymised and never stored in the free trial", credits: 0 },
  ];
  const maxCredits = lines.reduce((s, l) => s + l.credits, 0);
  let blocked: string | null = null;
  if (!state.workspace) blocked = "Sign up to get a Workspace first.";
  else if (!paid && !free) blocked = `${mainDomain ?? "Your Main Domain"} already used its free Test Run. Buy Credits to run another one.`;
  return { free, maxCredits, lines, blocked };
}

/** The most a scheduled agent run can cost with this schedule. */
export function perRunQuote(schedule: NicheSchedule): { maxCredits: number; lines: CostLine[] } {
  const lines: CostLine[] = [
    { label: `Up to ${schedule.prospectsPerRun} Prospects`, detail: `${PRICES.surfacedProspect} Credit per Surfaced Prospect`, credits: schedule.prospectsPerRun * PRICES.surfacedProspect },
    {
      label: `Up to ${schedule.prospectsPerRun * MAX_HIRING_CONTACTS_PER_PROSPECT} Hiring Contacts`,
      detail: `Up to ${MAX_HIRING_CONTACTS_PER_PROSPECT} per Prospect, ${PRICES.hiringContactFound} Credit each`,
      credits: schedule.prospectsPerRun * MAX_HIRING_CONTACTS_PER_PROSPECT * PRICES.hiringContactFound,
    },
    { label: `Up to ${schedule.candidatesPerRun} Candidates`, detail: `${PRICES.surfacedCandidate} Credit per Surfaced Candidate`, credits: schedule.candidatesPerRun * PRICES.surfacedCandidate },
  ];
  return { maxCredits: lines.reduce((s, l) => s + l.credits, 0), lines };
}

/** The next simulated day the Niche's agents run (after today), or null without scheduled days. */
export function nextRunOn(schedule: NicheSchedule, today: ISODate): ISODate | null {
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    if (schedule.days.includes(weekdayOf(day))) return day;
  }
  return null;
}

/** Signals that count against hiring (Prospects) or moving (Candidates), whatever their weight today. */
const NEGATIVE_SIGNAL_TYPES: ReadonlySet<SignalType> = new Set<SignalType>(["layoffs", "recently_started", "recently_promoted"]);

export function isNegativeSignal(type: SignalType): boolean {
  return NEGATIVE_SIGNAL_TYPES.has(type);
}

export type ResolvedItem =
  | { item: TestRunItem; kind: "prospect"; prospect: Prospect }
  | { item: TestRunItem; kind: "candidate"; candidate: Candidate }
  | { item: TestRunItem; kind: "preview"; preview: Preview };

/** Test Run items joined with their records. Items whose record no longer exists are left out. */
export function resolveItems(state: ClientState, testRun: TestRun): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  for (const item of testRun.items) {
    if (item.kind === "prospect") {
      const prospect = item.prospectId ? state.prospects.find((p) => p.id === item.prospectId) : undefined;
      if (prospect) out.push({ item, kind: "prospect", prospect });
      continue;
    }
    const candidate = item.candidateId ? state.candidates.find((c) => c.id === item.candidateId) : undefined;
    if (candidate) {
      out.push({ item, kind: "candidate", candidate });
      continue;
    }
    const preview = item.previewId ? state.previews.find((p) => p.id === item.previewId) : undefined;
    if (preview) out.push({ item, kind: "preview", preview });
  }
  return out;
}

/** People of a Niche still shown as Previews (revealed by the first Credit pack). */
export function pendingPreviews(state: ClientState, niche?: Niche): { hiringContacts: number; candidates: number } {
  const previews = niche ? state.previews.filter((p) => p.nicheId === niche.id) : state.previews;
  return {
    hiringContacts: previews.filter((p) => p.kind === "hiring_contact").length,
    candidates: previews.filter((p) => p.kind === "candidate").length,
  };
}

/** Credits the first pack took to reveal this Niche's Previews, at the normal price (ADR-0018). */
export function revealCreditsFor(ledger: CreditLedgerEntry[], nicheId: string): number {
  return ledger.reduce((sum, e) => (e.nicheId === nicheId && e.delta < 0 && e.ref.startsWith(REVEAL_LEDGER_REF) ? sum - e.delta : sum), 0);
}

/** Credits spent over the last `days` days, today included. */
export function spentWithin(ledger: CreditLedgerEntry[], today: ISODate, days: number): number {
  return ledger.reduce((sum, e) => {
    const age = diffDays(today, e.on);
    return e.delta < 0 && age >= 0 && age < days ? sum - e.delta : sum;
  }, 0);
}

/** Only same-origin paths are accepted as a return target. */
export function safeReturnTo(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}
