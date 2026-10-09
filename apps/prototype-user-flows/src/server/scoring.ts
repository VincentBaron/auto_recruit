// Deterministic scoring (ADR-0006): Signal Strength from dated Signals with per-Niche weights and
// age decay, and Fit from the Niche Profile criteria. Both explainable line by line.

import { diffDays } from "@/lib/dates";
import { TENURE_SWEET_SPOT_MONTHS } from "@/lib/labels";
import type {
  AppState,
  Candidate,
  DetectedRole,
  Fit,
  FitReason,
  NicheProfile,
  Prospect,
  Signal,
  SignalBreakdown,
  SignalWeight,
} from "@/lib/types";
import { ADJACENT_SECTORS, CITY_COUNTRY, EU_COUNTRIES } from "./pools";

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeight[] = [
  { type: "job_posting", label: "Job posting", description: "A role matching the Niche is published.", appliesTo: "prospect", weight: 30, halfLifeDays: 30, enabled: true, negative: false },
  { type: "job_posting_stale", label: "Job posting open 30+ days", description: "Open more than 30 days or reposted: they struggle to hire.", appliesTo: "prospect", weight: 25, halfLifeDays: 45, enabled: true, negative: false },
  { type: "funding_round", label: "Funding round", description: "A round was announced: hiring usually follows.", appliesTo: "prospect", weight: 35, halfLifeDays: 90, enabled: true, negative: false },
  { type: "new_leader", label: "New leader", description: "A new CTO, VP or Head joined and builds a team.", appliesTo: "prospect", weight: 25, halfLifeDays: 60, enabled: true, negative: false },
  { type: "headcount_growth", label: "Headcount growth", description: "Headcount grew fast over 6 months.", appliesTo: "prospect", weight: 15, halfLifeDays: 60, enabled: true, negative: false },
  { type: "expansion", label: "Expansion", description: "A new office, country or product line.", appliesTo: "prospect", weight: 15, halfLifeDays: 60, enabled: true, negative: false },
  { type: "layoffs", label: "Layoffs", description: "Staff reductions: hiring is unlikely.", appliesTo: "prospect", weight: -30, halfLifeDays: 120, enabled: true, negative: true },
  { type: "tenure_sweet_spot", label: "Tenure sweet spot", description: `${TENURE_SWEET_SPOT_MONTHS.min} to ${TENURE_SWEET_SPOT_MONTHS.max} months in the current role.`, appliesTo: "candidate", weight: 30, halfLifeDays: 180, enabled: true, negative: false },
  { type: "employer_turbulence", label: "Employer turbulence", description: "Restructuring, leadership exit or acquisition at the employer.", appliesTo: "candidate", weight: 35, halfLifeDays: 90, enabled: true, negative: false },
  { type: "title_stagnation", label: "Title stagnation", description: "Same title for 3 years or more.", appliesTo: "candidate", weight: 20, halfLifeDays: 180, enabled: true, negative: false },
  { type: "recently_started", label: "Recently started", description: "Joined the current employer less than 6 months ago.", appliesTo: "candidate", weight: -40, halfLifeDays: 120, enabled: true, negative: true },
  { type: "recently_promoted", label: "Recently promoted", description: "Promoted less than 6 months ago.", appliesTo: "candidate", weight: -25, halfLifeDays: 120, enabled: true, negative: true },
];

export function defaultSignalWeights(): SignalWeight[] {
  return DEFAULT_SIGNAL_WEIGHTS.map((w) => ({ ...w }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBreakdown(signals: Signal[], profile: NicheProfile, today: string): SignalBreakdown {
  const lines = signals
    .map((s) => {
      const w = profile.signalWeights.find((x) => x.type === s.type);
      const points = w ? w.weight : s.points;
      const halfLifeDays = w ? w.halfLifeDays : 60;
      const enabled = w ? w.enabled : true;
      const ageDays = Math.max(0, diffDays(today, s.date));
      // The decay is rounded to the 2 decimals every explainer shows, and the contribution is computed
      // from that rounded value, so "points x decay = contribution" always multiplies out on screen.
      const decay = round2(Math.pow(0.5, ageDays / halfLifeDays));
      return {
        signalId: s.id,
        type: s.type,
        label: s.label,
        date: s.date,
        ageDays,
        points,
        halfLifeDays,
        decay,
        contribution: enabled ? round1(points * decay) : 0,
        enabled,
        negative: points < 0,
      };
    })
    .sort((a, b) => a.ageDays - b.ageDays);
  const rawTotal = round1(lines.reduce((sum, l) => sum + l.contribution, 0));
  const total = Math.max(0, Math.min(100, Math.round(rawTotal)));
  return { lines, rawTotal, total, formula: "Sum of points x 0.5^(age in days / half-life), clamped to 0-100" };
}

/* ------------------------------------------------------------------ */
/* Fit                                                                 */
/* ------------------------------------------------------------------ */

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function countryOf(location: string): string {
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length > 1) return parts[parts.length - 1];
  return CITY_COUNTRY[norm(parts[0])] ?? parts[0];
}

function cityOf(location: string): string {
  return norm(location.split(",")[0]);
}

export function locationMatch(location: string, wanted: string[]): "yes" | "partial" | "no" {
  if (wanted.length === 0) return "yes";
  const city = cityOf(location);
  const country = countryOf(location);
  let best: "yes" | "partial" | "no" = "no";
  for (const raw of wanted) {
    let w = norm(raw);
    if (w.includes("remote")) {
      w = w.replace("remote", "").replace(/[()-]/g, " ").trim();
      if (w === "") return "yes";
    }
    if (w === "eu" || w === "europe") {
      if (EU_COUNTRIES.includes(country)) return "yes";
      best = "partial";
      continue;
    }
    if (w === city || w.includes(city) || city.includes(w)) return "yes";
    if (norm(country) === w) return "yes";
    const wantedCountry = CITY_COUNTRY[w];
    if (wantedCountry && wantedCountry === country) best = "partial";
  }
  return best;
}

const SENIORITY_WORDS = ["senior", "staff", "lead", "principal", "junior", "head of", "head", "mid-level", "mid"];

function roleCore(role: string): string {
  let r = norm(role);
  for (const w of SENIORITY_WORDS) r = r.replace(new RegExp(`\\b${w}\\b`, "g"), "");
  return r.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
}

export function roleMatch(title: string, roleTypes: string[]): "yes" | "partial" | "no" {
  if (roleTypes.length === 0) return "yes";
  const t = norm(title);
  let best: "yes" | "partial" | "no" = "no";
  for (const r of roleTypes) {
    const core = roleCore(r);
    if (core && t.includes(core)) return "yes";
    const coreWords = core.split(" ").filter((w) => w.length > 3);
    if (coreWords.length > 0 && coreWords.every((w) => t.includes(w))) return "yes";
    if (coreWords.some((w) => t.includes(w))) best = "partial";
  }
  return best;
}

export function seniorityOf(title: string): string {
  const t = norm(title);
  if (/\b(head|vp|chief|director)\b/.test(t)) return "Head";
  if (/\b(principal)\b/.test(t)) return "Principal";
  if (/\b(staff)\b/.test(t)) return "Staff";
  if (/\b(lead)\b/.test(t)) return "Lead";
  if (/\b(senior|sr)\b/.test(t)) return "Senior";
  if (/\b(junior|jr|graduate|intern)\b/.test(t)) return "Junior";
  return "Mid-level";
}

const SENIORITY_ORDER = ["Junior", "Mid-level", "Senior", "Lead", "Staff", "Principal", "Head"];

function seniorityMatch(seniority: string, wanted: string[]): "yes" | "partial" | "no" {
  if (wanted.length === 0) return "yes";
  const w = wanted.map((x) => norm(x));
  if (w.includes(norm(seniority))) return "yes";
  const idx = SENIORITY_ORDER.indexOf(seniority);
  const near = wanted.some((x) => {
    const j = SENIORITY_ORDER.findIndex((s) => norm(s) === norm(x));
    return j >= 0 && Math.abs(j - idx) === 1;
  });
  return near ? "partial" : "no";
}

export function sectorMatch(values: string[], wanted: string[]): "yes" | "partial" | "no" {
  if (wanted.length === 0) return "yes";
  const vs = values.map(norm);
  const ws = wanted.map(norm);
  if (vs.some((v) => ws.some((w) => v === w || v.includes(w) || w.includes(v)))) return "yes";
  for (const w of ws) {
    const adjacent = ADJACENT_SECTORS[w] ?? [];
    if (vs.some((v) => adjacent.includes(v))) return "partial";
    for (const [key, list] of Object.entries(ADJACENT_SECTORS)) {
      if (list.includes(w) && vs.some((v) => v === key || list.includes(v))) return "partial";
    }
  }
  return "no";
}

const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E"];

function stageMatch(round: string | null, wanted: string[]): "yes" | "partial" | "no" {
  if (wanted.length === 0) return "yes";
  if (!round) return "partial";
  if (wanted.some((w) => norm(w) === norm(round))) return "yes";
  const idx = STAGES.findIndex((s) => norm(s) === norm(round));
  const near = wanted.some((w) => {
    const j = STAGES.findIndex((s) => norm(s) === norm(w));
    return j >= 0 && Math.abs(j - idx) === 1;
  });
  return near ? "partial" : "no";
}

function reason(label: string, matched: "yes" | "partial" | "no", maxPoints: number, partialRatio = 0.5): FitReason {
  const points = matched === "yes" ? maxPoints : matched === "partial" ? Math.round(maxPoints * partialRatio) : 0;
  return { label, matched, points, maxPoints };
}

function buildFit(reasons: FitReason[], threshold: number, adjust = 0): Fit {
  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0) + adjust));
  const misses = reasons.filter((r) => r.matched !== "yes").map((r) => r.label.split(":")[0].toLowerCase());
  const weaker = misses.length > 0 ? `, weaker on ${misses.slice(0, 2).join(" and ")}` : "";
  const summary = misses.length === 0 ? "Strong Fit on every criterion" : score >= 85 ? `Strong Fit${weaker}` : `Good Fit${weaker}`;
  return { score, threshold, aboveThreshold: score >= threshold, reasons, summary: score < threshold ? `Below the Fit threshold (${threshold})` : summary };
}

export function fitProspect(p: Prospect, profile: NicheProfile, roles: DetectedRole[]): Fit {
  const size = p.headcount;
  const { min, max } = profile.companySize;
  const sizeMatch: "yes" | "partial" | "no" =
    size >= min && size <= max ? "yes" : size >= min * 0.7 && size <= max * 1.3 ? "partial" : "no";
  const roleTitles = roles.map((r) => r.title);
  const postingLabels = p.signals.filter((s) => s.type === "job_posting" || s.type === "job_posting_stale").map((s) => s.label);
  const hiringMatch: "yes" | "partial" | "no" = roleTitles.some((t) => roleMatch(t, profile.roleTypes) === "yes")
    ? "yes"
    : postingLabels.some((l) => roleMatch(l, profile.roleTypes) !== "no") || roleTitles.length > 0
      ? "partial"
      : "no";
  const reasons: FitReason[] = [
    reason(`Sector: ${p.sector}`, sectorMatch([p.sector, ...p.tags], profile.sectors), 30),
    reason(`Company size: ${size} people (target ${min}-${max})`, sizeMatch, 20),
    reason(`Funding stage: ${p.latestFunding ? p.latestFunding.round : "unknown"}`, stageMatch(p.latestFunding?.round ?? null, profile.fundingStages), 15),
    reason(`Location: ${p.location}`, locationMatch(p.location, profile.locations), 15),
    reason(
      roleTitles.length > 0 ? `Hiring for target roles: ${roleTitles.join(", ")}` : "Hiring for target roles: no Detected Role yet",
      hiringMatch,
      20,
      0.6,
    ),
  ];
  return buildFit(reasons, profile.fitThreshold);
}

function yearsRequired(text: string): number | null {
  const m = text.match(/(\d+)\s*\+?\s*(?:years|yrs|ans)/i);
  return m ? Number(m[1]) : null;
}

export function fitCandidate(c: Candidate, profile: NicheProfile): Fit {
  const sectors = Array.from(new Set(c.workHistory.map((w) => w.employerSector)));
  const text = norm(profile.candidateProfile);
  const matchedSkills = c.skills.filter((s) => text.includes(norm(s)));
  const required = yearsRequired(profile.candidateProfile);
  const yearsOk = required === null || c.yearsExperience >= required;
  const judgement: "yes" | "partial" | "no" = yearsOk && (matchedSkills.length >= 1 || text.length === 0) ? "yes" : yearsOk || matchedSkills.length > 0 ? "partial" : "no";
  const judgementLabel =
    matchedSkills.length > 0
      ? `Candidate profile: ${matchedSkills.slice(0, 3).join(", ")}, ${c.yearsExperience} years`
      : `Candidate profile: ${c.yearsExperience} years${required !== null ? ` (wants ${required}+)` : ""}`;
  const reasons: FitReason[] = [
    reason(`Role: ${c.currentTitle}`, roleMatch(c.currentTitle, profile.roleTypes), 30),
    reason(`Seniority: ${c.seniority}`, seniorityMatch(c.seniority, profile.seniority), 20),
    reason(`Location: ${c.location}`, locationMatch(c.location, profile.locations), 20),
    reason(`Sector background: ${sectors.slice(0, 3).join(", ")}`, sectorMatch(sectors, profile.sectors), 15),
    reason(judgementLabel, judgement, 15),
  ];
  return buildFit(reasons, profile.fitThreshold);
}

/* ------------------------------------------------------------------ */
/* Rescoring                                                           */
/* ------------------------------------------------------------------ */

function profileFor(state: AppState, nicheIds: string[]): NicheProfile | null {
  for (const id of nicheIds) {
    const n = state.niches.find((x) => x.id === id);
    if (n) return n.profile;
  }
  return null;
}

function syncPoints(signals: Signal[], profile: NicheProfile): void {
  for (const s of signals) {
    const w = profile.signalWeights.find((x) => x.type === s.type);
    if (w) s.points = w.weight;
  }
}

export function rescoreProspect(state: AppState, p: Prospect): void {
  const profile = profileFor(state, p.nicheIds);
  if (!profile) return;
  syncPoints(p.signals, profile);
  p.breakdown = computeBreakdown(p.signals, profile, state.clock.today);
  p.signalStrength = p.breakdown.total;
  const roles = state.detectedRoles.filter((r) => r.prospectId === p.id);
  p.fit = fitProspect(p, profile, roles);
}

export function rescoreCandidate(state: AppState, c: Candidate): void {
  const profile = profileFor(state, c.nicheIds);
  if (!profile) return;
  syncPoints(c.signals, profile);
  c.breakdown = computeBreakdown(c.signals, profile, state.clock.today);
  c.signalStrength = c.breakdown.total;
  c.fit = fitCandidate(c, profile);
}

export function rescoreAll(state: AppState): void {
  for (const p of state.prospects) rescoreProspect(state, p);
  for (const c of state.candidates) rescoreCandidate(state, c);
}

export function rescoreNiche(state: AppState, nicheId: string): void {
  for (const p of state.prospects) if (p.nicheIds.includes(nicheId)) rescoreProspect(state, p);
  for (const c of state.candidates) if (c.nicheIds.includes(nicheId)) rescoreCandidate(state, c);
}

/** Empty placeholders used when creating entities before the first rescore. */
export const EMPTY_BREAKDOWN: SignalBreakdown = { lines: [], rawTotal: 0, total: 0, formula: "" };
export const EMPTY_FIT: Fit = { score: 0, threshold: 0, aboveThreshold: false, reasons: [], summary: "" };
