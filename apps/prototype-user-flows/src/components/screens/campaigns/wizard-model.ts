// State of the "New Campaign" wizard: the draft, its defaults, per-step validation, the Outreach
// Agent's canned suggestions for the Brief, and the per-tab saved copy of the draft (sessionStorage)
// so Back, Forward and reload never lose it.

import { AUDIENCE_LABELS } from "@/lib/labels";
import type {
  Autonomy,
  CampaignAudience,
  CampaignInput,
  ClientState,
  Niche,
  PersonRef,
  Weekday,
} from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";
import { eligiblePeople, isUsableMailbox, parsePersonKey, personKey } from "./derive";

export interface WizardPrefill {
  nicheId?: string;
  audience?: CampaignAudience;
  detectedRoleId?: string;
  /** Person keys, "candidate:<id>" or "hiring_contact:<id>". */
  people?: string[];
}

/** One email of the Sequence being written. `uid` keys the editable row; the step number is its index + 1. */
export interface WizardSequenceStep {
  uid: string;
  delayDays: number;
  instruction: string;
}

let stepSeq = 0;

/** A new stable id for a Sequence row of this page (never reused while the page lives). */
export function stepUid(): string {
  stepSeq += 1;
  return `seq-${stepSeq}`;
}

export function newSequenceStep(index: number): WizardSequenceStep {
  return { uid: stepUid(), delayDays: index === 0 ? 0 : index === 1 ? 4 : 7, instruction: DEFAULT_INSTRUCTIONS[index] ?? "" };
}

export interface WizardDraft {
  nicheId: string | null;
  audience: CampaignAudience;
  name: string;
  nameTouched: boolean;
  angle: string;
  callToAction: string;
  detectedRoleId: string | null;
  sequence: WizardSequenceStep[];
  mailboxIds: string[];
  days: Weekday[];
  start: string;
  end: string;
  autonomy: Autonomy;
  reviewFirstN: number;
  selected: string[];
  autoAdd: boolean;
  autoAddMin: number;
}

export type StepKey = "niche" | "brief" | "sequence" | "sending" | "autonomy" | "recipients" | "drafts";

export const STEPS: { key: StepKey; label: string; description: string }[] = [
  { key: "niche", label: "Niche and audience", description: "A Campaign reaches either Hiring Contacts or Candidates, within one Niche." },
  { key: "brief", label: "Brief", description: "The angle and call to action the Outreach Agent writes from, and an optional Detected Role." },
  { key: "sequence", label: "Sequence", description: "A first email and up to two follow-ups, with the delays between them." },
  { key: "sending", label: "Sending", description: "The Sending Mailboxes and the window emails go out in." },
  { key: "autonomy", label: "Autonomy", description: "How much you review before emails are scheduled." },
  { key: "recipients", label: "Recipients", description: "Enriched people of the Niche, now and as you enrich more." },
  { key: "drafts", label: "Drafts and launch", description: "Drafts for three recipients exactly as they will receive them, footer included." },
];

export const SENDING_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];

export const DEFAULT_INSTRUCTIONS = ["First email, one Signal as the hook", "Short nudge with one new fact", "Last note, easy way out"];

export function defaultSequence(): WizardSequenceStep[] {
  return [newSequenceStep(0), newSequenceStep(1)];
}

export function stepIndex(key: string | null): number {
  const i = STEPS.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

/** "Fintech backend engineers - Series A-C - Paris" -> "Fintech backend engineers". */
export function shortNicheName(n: Niche | undefined): string {
  return n ? n.name.split(" - ")[0] : "New Campaign";
}

export function suggestedName(state: ClientState, d: Pick<WizardDraft, "nicheId" | "audience" | "detectedRoleId">): string {
  const role = d.detectedRoleId ? state.detectedRoles.find((r) => r.id === d.detectedRoleId) : undefined;
  const prospect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  if (role && prospect) return d.audience === "candidates" ? `${role.title} - Candidates for ${prospect.name}` : `${role.title} at ${prospect.name}`;
  const niche = state.niches.find((n) => n.id === d.nicheId);
  return `${shortNicheName(niche)} - ${AUDIENCE_LABELS[d.audience]}`;
}

export function initialDraft(state: ClientState, prefill: WizardPrefill): WizardDraft {
  const me = state.session.recruiterId;
  const role = prefill.detectedRoleId ? state.detectedRoles.find((r) => r.id === prefill.detectedRoleId) : undefined;
  const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  const usable = state.niches.filter((n) => n.status !== "draft");
  const nicheId =
    (prefill.nicheId && usable.some((n) => n.id === prefill.nicheId) ? prefill.nicheId : null) ??
    roleProspect?.nicheIds.find((id) => usable.some((n) => n.id === id)) ??
    (usable.find((n) => n.ownerId === me && n.status === "active") ?? usable.find((n) => n.status === "active") ?? usable[0])?.id ??
    null;
  const people = (prefill.people ?? []).filter((k) => parsePersonKey(k) !== null);
  const audience: CampaignAudience =
    prefill.audience ?? (people[0] ? (people[0].startsWith("candidate:") ? "candidates" : "hiring_contacts") : "hiring_contacts");
  // Only people who can join: a prefilled person claimed by another Recruiter (or already in a
  // Campaign) is never selected behind the Recruiter's back.
  const joinable = nicheId
    ? new Set(eligiblePeople(state, { nicheId, audience, recruiterId: me }).filter((p) => !p.blocked).map((p) => personKey(p.info)))
    : new Set<string>();
  const selected = people.filter((k) => joinable.has(k));
  const detectedRoleId = role && roleProspect && nicheId && roleProspect.nicheIds.includes(nicheId) ? role.id : null;
  const mailboxIds = state.mailboxes.filter((m) => m.recruiterId === me && isUsableMailbox(m)).map((m) => m.id);
  return {
    nicheId,
    audience,
    name: suggestedName(state, { nicheId, audience, detectedRoleId }),
    nameTouched: false,
    angle: "",
    callToAction: "",
    detectedRoleId,
    sequence: defaultSequence(),
    mailboxIds,
    days: [...SENDING_DAYS],
    start: "09:00",
    end: "17:30",
    autonomy: "review_first_n",
    reviewFirstN: 5,
    selected,
    autoAdd: false,
    autoAddMin: 60,
  };
}

export function selectedRefs(d: WizardDraft): PersonRef[] {
  return d.selected.map(parsePersonKey).filter((r): r is PersonRef => r !== null);
}

export function toCampaignInput(d: WizardDraft): CampaignInput {
  return {
    nicheId: d.nicheId ?? "",
    name: d.name.trim(),
    audience: d.audience,
    brief: { angle: d.angle.trim(), callToAction: d.callToAction.trim(), detectedRoleId: d.detectedRoleId },
    sequence: d.sequence.map((s, i) => ({ step: i + 1, delayDays: i === 0 ? 0 : s.delayDays, instruction: s.instruction.trim() || DEFAULT_INSTRUCTIONS[i] })),
    sendingWindow: { days: d.days, start: d.start, end: d.end, recipientTimezone: true },
    autonomy: d.autonomy,
    reviewFirstN: d.reviewFirstN,
    mailboxIds: d.mailboxIds,
    autoAddRule: d.autoAdd ? { minSignalStrength: d.autoAddMin } : null,
  };
}

/** The first problem blocking a step, or null when the step is complete. */
export function stepError(key: StepKey, d: WizardDraft, state: ClientState): string | null {
  switch (key) {
    case "niche":
      if (!d.nicheId) return "Choose a Niche.";
      if (!d.name.trim()) return "Give the Campaign a name.";
      return null;
    case "brief":
      if (!d.angle.trim()) return "Write the angle of the Brief.";
      if (!d.callToAction.trim()) return "Add a call to action.";
      return null;
    case "sequence":
      if (d.sequence.slice(1).some((s) => !Number.isFinite(s.delayDays) || s.delayDays < 1 || s.delayDays > 30)) return "Follow-ups need a delay between 1 and 30 days.";
      return null;
    case "sending": {
      const usable = d.mailboxIds.filter((id) => {
        const m = state.mailboxes.find((x) => x.id === id);
        return m !== undefined && isUsableMailbox(m);
      });
      if (usable.length === 0) return "Choose at least one active or ramping Sending Mailbox.";
      if (d.days.length === 0) return "Pick at least one sending day.";
      if (!d.start || !d.end || d.start >= d.end) return "The sending window must end after it starts.";
      return null;
    }
    case "autonomy":
      if (d.autonomy === "review_first_n" && (!Number.isFinite(d.reviewFirstN) || d.reviewFirstN < 1 || d.reviewFirstN > 100)) return "Review between 1 and 100 first emails.";
      return null;
    case "recipients":
      if (d.selected.length === 0 && !d.autoAdd) return "Select at least one recipient, or turn on the auto-add rule.";
      return null;
    case "drafts":
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Outreach Agent suggestions for the Brief                            */
/* ------------------------------------------------------------------ */

function lower(s: string): string {
  return s.toLowerCase();
}

function pluralRole(role: string): string {
  const r = lower(role);
  return r.endsWith("s") ? r : `${r}s`;
}

function where(location: string | undefined): string {
  if (!location) return "across Europe";
  if (/^remote/i.test(location)) return "remote across Europe";
  return `in ${location}`;
}

function stageRange(stages: string[]): string {
  if (stages.length === 0) return "fast-growing";
  if (stages.length === 1) return stages[0];
  const allSeries = stages.every((s) => s.startsWith("Series "));
  if (allSeries) return `Series ${stages[0].slice(7)}-${stages[stages.length - 1].slice(7)}`;
  return `${stages[0]} to ${stages[stages.length - 1]}`;
}

export function angleSuggestions(niche: Niche | undefined, audience: CampaignAudience, roleTitle: string | null): string[] {
  const p = niche?.profile;
  const role = roleTitle ?? p?.roleTypes[0] ?? "Engineer";
  const seniority = p?.seniority[0] ? `${lower(p.seniority[0])} ` : "";
  const sector = lower(p?.sectors[0] ?? "tech");
  const loc = where(p?.locations[0]);
  const stages = stageRange(p?.fundingStages ?? []);
  if (audience === "hiring_contacts") {
    return [
      `I place ${seniority}${pluralRole(role)} with ${sector} teams ${loc}, and two strong candidates are available now`,
      `I specialise in ${lower(role)} hiring for ${stages} ${sector} companies, with a vetted shortlist in under two weeks`,
    ];
  }
  return [
    `I work with ${stages} ${sector} companies ${loc} hiring ${seniority}${pluralRole(role)}, with salary bands shared upfront`,
    `A ${sector} team I know well is hiring a ${lower(role)} and your background matches what they look for`,
  ];
}

export function ctaSuggestions(audience: CampaignAudience): string[] {
  return audience === "hiring_contacts"
    ? ["a 15-minute call this week", "a short call next week", "a reply with the right person to talk to"]
    : ["a 20-minute call this week", "a short call next week", "a quick chat about what you would want next"];
}

/* ------------------------------------------------------------------ */
/* The draft saved per tab                                             */
/* ------------------------------------------------------------------ */

// sessionStorage is per tab: the draft survives Back, Forward, reload and links opened from the
// wizard, never leaks to another tab, and is gone once the tab closes. One key per wizard session
// (the `draft` query parameter), so "New Campaign" always starts fresh and a prefilled wizard
// (from a Prospect or the Feed) never inherits an older draft.

const STORAGE_PREFIX = "auto-recruit:campaign-wizard:";
const MAX_SAVED_SESSIONS = 5;

export interface WizardSnapshot {
  draft: WizardDraft;
  maxReached: number;
  dirty: boolean;
}

interface StoredSnapshot extends WizardSnapshot {
  v: 1;
  savedAt: number;
}

export function isWizardSessionId(id: string | null): id is string {
  return id !== null && /^[a-z0-9]{6,24}$/.test(id);
}

/** Called from an effect or an event handler only (randomness never runs during render). */
export function newWizardSessionId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_679_616)
    .toString(36)
    .padStart(4, "0")}`;
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : v === null ? Number.NaN : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Rebuilds a draft from storage, field by field, so a stale or tampered copy can never break the page. */
function parseDraft(raw: unknown): WizardDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const audience = d.audience === "candidates" || d.audience === "hiring_contacts" ? d.audience : null;
  const autonomy = d.autonomy === "review_all" || d.autonomy === "review_first_n" || d.autonomy === "auto" ? d.autonomy : null;
  if (!audience || !autonomy || !Array.isArray(d.sequence) || d.sequence.length < 1 || d.sequence.length > 3) return null;
  // NaN (an emptied number field) is stored as null by JSON and comes back as NaN.
  const sequence = d.sequence.map((x, i) => {
    const step = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { uid: stepUid(), delayDays: i === 0 ? 0 : num(step.delayDays, 4), instruction: str(step.instruction, DEFAULT_INSTRUCTIONS[i] ?? "") };
  });
  return {
    nicheId: typeof d.nicheId === "string" ? d.nicheId : null,
    audience,
    name: str(d.name, ""),
    nameTouched: d.nameTouched === true,
    angle: str(d.angle, ""),
    callToAction: str(d.callToAction, ""),
    detectedRoleId: typeof d.detectedRoleId === "string" ? d.detectedRoleId : null,
    sequence,
    mailboxIds: strs(d.mailboxIds),
    days: strs(d.days).filter((x): x is Weekday => (WEEKDAYS as string[]).includes(x)),
    start: str(d.start, "09:00"),
    end: str(d.end, "17:30"),
    autonomy,
    reviewFirstN: num(d.reviewFirstN, 5),
    selected: strs(d.selected).filter((k) => parsePersonKey(k) !== null),
    autoAdd: d.autoAdd === true,
    autoAddMin: num(d.autoAddMin, 60),
  };
}

export function readWizardSnapshot(sessionId: string): WizardSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + sessionId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (parsed.v !== 1) return null;
    const draft = parseDraft(parsed.draft);
    if (!draft) return null;
    const maxReached = Math.max(0, Math.min(STEPS.length - 1, Math.floor(num(parsed.maxReached, 0) || 0)));
    return { draft, maxReached, dirty: parsed.dirty === true };
  } catch {
    return null;
  }
}

export function writeWizardSnapshot(sessionId: string, snapshot: WizardSnapshot): void {
  try {
    const stored: StoredSnapshot = { v: 1, savedAt: Date.now(), ...snapshot };
    window.sessionStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(stored));
    // Keep only the latest few wizard sessions of this tab.
    const sessions: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const savedAt = (JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Partial<StoredSnapshot>).savedAt;
      sessions.push({ key, savedAt: typeof savedAt === "number" ? savedAt : 0 });
    }
    sessions.sort((a, b) => b.savedAt - a.savedAt);
    for (const old of sessions.slice(MAX_SAVED_SESSIONS)) window.sessionStorage.removeItem(old.key);
  } catch {
    // Storage full or blocked (private mode): the wizard still works, it just forgets on reload.
  }
}

export function clearWizardSnapshot(sessionId: string): void {
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + sessionId);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
