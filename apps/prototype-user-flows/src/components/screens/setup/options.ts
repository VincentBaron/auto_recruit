// Option lists and small pure helpers shared by the Niche setup and Niche Profile screens.
// Values match what the setup agent understands (see src/server/agents.ts).

import { addDays, weekdayOf } from "@/lib/dates";
import { formatWeekdays } from "@/lib/format";
import type { AgentRun, ISODate, Niche, NicheProfile, NicheSchedule, NicheWizardInput, SignalWeight } from "@/lib/types";

export const SECTOR_OPTIONS = [
  "Fintech",
  "Payments",
  "Healthtech",
  "Digital health",
  "Medtech",
  "Insurtech",
  "Proptech",
  "Edtech",
  "B2B SaaS",
  "E-commerce",
  "Cybersecurity",
  "Climate tech",
  "Legaltech",
  "Logistics",
  "Gaming",
  "Biotech",
];

export const LOCATION_OPTIONS = [
  "Paris",
  "Lyon",
  "Bordeaux",
  "Nantes",
  "Lille",
  "Marseille",
  "Toulouse",
  "France",
  "London",
  "Berlin",
  "Munich",
  "Amsterdam",
  "Madrid",
  "Barcelona",
  "Lisbon",
  "Dublin",
  "Stockholm",
  "Remote EU",
];

export const ROLE_OPTIONS = [
  "Backend Engineer",
  "Frontend Engineer",
  "Full-stack Engineer",
  "Platform Engineer",
  "Software Engineer",
  "Data Engineer",
  "Data Scientist",
  "Mobile Engineer",
  "Engineering Manager",
  "Product Designer",
  "UX Designer",
  "Product Manager",
  "Account Executive",
];

export const SENIORITY_OPTIONS = ["Junior", "Mid-level", "Senior", "Staff", "Lead", "Principal"];

export const FUNDING_STAGE_OPTIONS = ["Seed", "Series A", "Series B", "Series C", "Series D"];

export const SIZE_PRESETS: { label: string; min: number; max: number }[] = [
  { label: "10-80", min: 10, max: 80 },
  { label: "20-300", min: 20, max: 300 },
  { label: "50-500", min: 50, max: 500 },
  { label: "200-2 000", min: 200, max: 2000 },
];

/** Profile field keys as the setup agent reports them in `updatedFields`. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Niche name",
  sectors: "Sectors",
  companySize: "Company size",
  fundingStages: "Funding stages",
  locations: "Locations",
  roleTypes: "Role types",
  seniority: "Seniority",
  candidateProfile: "Candidate profile",
  fitThreshold: "Fit threshold",
  signalWeights: "Signal weights",
  searchStrategy: "Search strategy",
};

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function listText(items: string[], empty = "-"): string {
  if (items.length === 0) return empty;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function stageText(stages: string[]): string {
  if (stages.length === 0) return "Any stage";
  if (stages.length === 1) return stages[0];
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (first.startsWith("Series") && last.startsWith("Series")) return `Series ${first.slice(-1)}-${last.slice(-1)}`;
  return `${first} to ${last}`;
}

export function sizeText(size: { min: number; max: number }): string {
  return `${size.min}-${size.max} people`;
}

/** Same naming rule as the setup agent: "Fintech backend engineers - Series A-C - Paris". */
export function suggestNicheName(p: Pick<NicheWizardInput, "sectors" | "roleTypes" | "fundingStages" | "locations">): string {
  const sector = p.sectors[0] ?? "Tech";
  const role = (p.roleTypes[0] ?? "Engineer").toLowerCase();
  const parts = [`${sector} ${role}s`];
  if (p.fundingStages.length > 0) parts.push(stageText(p.fundingStages));
  parts.push(p.locations.length > 0 ? p.locations.join(", ").replace("Remote EU", "remote EU") : "Europe");
  return parts.join(" - ");
}

/** One-line summary of a Niche Profile for lists. */
export function profileSummary(p: NicheProfile): string {
  const parts = [
    p.sectors.length ? p.sectors.join(", ") : null,
    sizeText(p.companySize),
    p.fundingStages.length ? stageText(p.fundingStages) : null,
    p.locations.length ? p.locations.join(", ") : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function scheduleText(s: NicheSchedule): string {
  return `${formatWeekdays(s.days)} at ${s.time}`;
}

/** The agents run when the simulated day advances onto a scheduled weekday. */
export function nextRunOn(schedule: NicheSchedule, today: ISODate): ISODate | null {
  if (schedule.days.length === 0) return null;
  for (let d = 1; d <= 7; d++) {
    const day = addDays(today, d);
    if (schedule.days.includes(weekdayOf(day))) return day;
  }
  return null;
}

/** Maximum Credits a scheduled run can spend (placeholder prices): 1 per Surfaced item, 1 per Hiring Contact (up to 3 per Prospect). */
export function runCostEstimate(s: Pick<NicheSchedule, "prospectsPerRun" | "candidatesPerRun">, prices: { prospect: number; candidate: number; hiringContact: number }) {
  const prospects = s.prospectsPerRun * prices.prospect;
  const hiringContacts = s.prospectsPerRun * 3 * prices.hiringContact;
  const candidates = s.candidatesPerRun * prices.candidate;
  return { prospects, hiringContacts, candidates, total: prospects + hiringContacts + candidates };
}

/** Value of a Signal of this weight after `days`, with the weight's half-life (ADR-0006). */
export function decayedValue(w: Pick<SignalWeight, "weight" | "halfLifeDays">, days: number): number {
  if (w.halfLifeDays <= 0) return 0;
  return w.weight * Math.pow(0.5, days / w.halfLifeDays);
}

export function oneDecimal(n: number): string {
  const v = Math.round(n * 10) / 10;
  const s = v.toFixed(1);
  return v > 0 ? `+${s}` : s;
}

/**
 * Why the Niche's latest agent run stopped early (for example "Credits ran out"), or null when it
 * completed or the Niche never ran. `credits` is true when buying Credits is the way out.
 */
export function lastRunStop(runs: AgentRun[], nicheId: string): { reason: string; credits: boolean } | null {
  const latest = runs.filter((r) => r.nicheId === nicheId).at(-1);
  if (!latest?.stoppedReason) return null;
  return { reason: latest.stoppedReason, credits: /credit/i.test(latest.stoppedReason) };
}

/** The Recruiter's most recent Niche still being set up, if any. */
export function latestOpenDraft(niches: Niche[], recruiterId: string | null): Niche | null {
  const open = niches.filter((n) => n.status === "draft" && !n.setupComplete && (!recruiterId || n.ownerId === recruiterId));
  return open.length > 0 ? open[open.length - 1] : null;
}
