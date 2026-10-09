// Generators for fictional Prospects, Detected Roles, Hiring Contacts, Candidates, contact values
// and Previews. Used by the seed scenarios and by the simulated agent runs.

import { addDays, diffDays } from "@/lib/dates";
import { formatTenure } from "@/lib/format";
import type {
  AppState,
  Candidate,
  ContactKind,
  Fit,
  ContactValue,
  DetectedRole,
  HiringContact,
  Language,
  Niche,
  NicheProfile,
  Preview,
  Prospect,
  Signal,
  SignalBreakdown,
  SignalType,
  WorkHistoryEntry,
} from "@/lib/types";
import { RETENTION, TENURE_SWEET_SPOT_MONTHS } from "@/lib/labels";
import { slug } from "./helpers";
import {
  DEFAULT_SKILLS,
  EMPLOYERS,
  EU_CITIES,
  FIRST_NAMES_EU,
  FIRST_NAMES_FR,
  HIRING_CONTACT_TITLES_DESIGN,
  HIRING_CONTACT_TITLES_GENERIC,
  HIRING_CONTACT_TITLES_TECH,
  LAST_NAMES_EU,
  LAST_NAMES_FR,
  NAME_PREFIXES,
  NEWS_SITE,
  PERSONAL_EMAIL_DOMAINS,
  ROLE_SKILLS,
  SECTOR_DESCRIPTIONS,
  SECTOR_SUFFIXES,
  TURBULENCE_EVENTS,
  CITY_COUNTRY,
} from "./pools";
import { Rng, rngFor } from "./rng";
import { EMPTY_BREAKDOWN, EMPTY_FIT, locationMatch, rescoreCandidate, rescoreProspect, roleMatch, sectorMatch, seniorityOf, norm } from "./scoring";
import { holder, newId } from "./runtime";

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

export interface SignalSeed {
  type: SignalType;
  ageDays: number;
  label?: string;
}

export interface RoleSeed {
  title: string;
  ageDays: number;
  stale?: boolean;
}

export interface ProspectSeed {
  name: string;
  domain: string;
  sector: string;
  tags: string[];
  description: string;
  headcount: number;
  location: string;
  founded: number;
  funding: { round: string; amountEur: number; ageDays: number } | null;
  signals: SignalSeed[];
  roles: RoleSeed[];
}

export interface HiringContactSeed {
  name: string;
  title: string;
  rank: number;
  location: string;
  language: Language;
  yearsInRole: number;
}

export interface CandidateSeed {
  name: string;
  language: Language;
  location: string;
  currentTitle: string;
  currentEmployer: string;
  employerSector: string;
  tenureMonths: number;
  yearsExperience: number;
  skills: string[];
  previous: { employer: string; employerSector: string; title: string; months: number }[];
  signals: SignalSeed[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function asciiLocal(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function sectorFamily(sectors: string[]): "fintech" | "healthtech" | "default" {
  const s = norm(sectors.join(" "));
  if (/fin|pay|bank|lend|insur|wealth|regtech/.test(s)) return "fintech";
  if (/health|med|care|clinic|pharma|bio/.test(s)) return "healthtech";
  return "default";
}

function countryOf(location: string): string {
  const parts = location.split(",").map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] : CITY_COUNTRY[norm(parts[0])] ?? "France";
}

export function languageFor(location: string): Language {
  return countryOf(location) === "France" ? "fr" : "en";
}

/** A concrete "City, Country" location that matches the Niche most of the time. */
export function pickLocation(profile: NicheProfile, rng: Rng, matchProbability = 0.85): string {
  const wanted = profile.locations.filter(Boolean);
  if (wanted.length > 0 && rng.chance(matchProbability)) {
    const w = rng.pick(wanted);
    const n = norm(w);
    if (n.includes("remote") || n === "eu" || n === "europe" || n.includes("europe")) {
      const c = rng.pick(EU_CITIES);
      return `${c.city}, ${c.country}`;
    }
    const country = CITY_COUNTRY[n];
    if (country) return `${capitalize(w.split(",")[0].trim())}, ${country}`;
    if (w.includes(",")) return w;
    return `${capitalize(w)}, ${countryOf(w)}`;
  }
  const c = rng.pick(EU_CITIES);
  return `${c.city}, ${c.country}`;
}

function usedNames(state: AppState): Set<string> {
  return new Set([...state.candidates.map((c) => c.name), ...state.hiringContacts.map((h) => h.name)]);
}

export function personName(state: AppState, rng: Rng, language: Language, extraUsed?: Set<string>): string {
  const used = usedNames(state);
  const firsts = language === "fr" ? FIRST_NAMES_FR : FIRST_NAMES_EU;
  const lasts = language === "fr" ? LAST_NAMES_FR : LAST_NAMES_EU;
  for (let i = 0; i < 60; i++) {
    const n = `${rng.pick(firsts)} ${rng.pick(lasts)}`;
    if (!used.has(n) && !extraUsed?.has(n) && n !== "Camille Martin" && n !== "Vincent Baron") {
      extraUsed?.add(n);
      return n;
    }
  }
  return `${rng.pick(firsts)} ${rng.pick(lasts)}-${rng.int(2, 9)}`;
}

function companyName(state: AppState, family: "fintech" | "healthtech" | "default", rng: Rng): string {
  const used = new Set(state.prospects.map((p) => norm(p.name)));
  const suffixes = SECTOR_SUFFIXES[family];
  for (let i = 0; i < 80; i++) {
    const n = `${rng.pick(NAME_PREFIXES)}${rng.pick(suffixes)}`;
    if (!used.has(norm(n))) return n;
  }
  return `${rng.pick(NAME_PREFIXES)}${rng.pick(suffixes)} ${rng.int(2, 99)}`;
}

function amountFor(round: string, rng: Rng): number {
  const r = norm(round);
  if (r.includes("pre-seed")) return rng.int(3, 15) * 100_000;
  if (r.includes("seed")) return rng.int(2, 6) * 1_000_000;
  if (r.includes("series a")) return rng.int(8, 22) * 1_000_000;
  if (r.includes("series b")) return rng.int(20, 60) * 1_000_000;
  if (r.includes("series c")) return rng.int(45, 120) * 1_000_000;
  if (r.includes("series e")) return rng.int(120, 300) * 1_000_000;
  return rng.int(10, 40) * 1_000_000;
}

function formatAmount(eur: number): string {
  return eur >= 1_000_000 ? `€${Math.round(eur / 100_000) / 10}M` : `€${Math.round(eur / 1000)}k`;
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export function prospectSignal(today: string, p: { name: string; domain: string }, seed: SignalSeed, ctx: { roleTitle?: string; funding?: { round: string; amountEur: number } | null }): Signal {
  const date = addDays(today, -seed.ageDays);
  const role = ctx.roleTitle ?? "Senior Engineer";
  let label = seed.label;
  let evidenceUrl = `https://${p.domain}`;
  let source = `${p.name} website`;
  switch (seed.type) {
    case "job_posting":
      label ??= `Hiring a ${role}`;
      evidenceUrl = `https://${p.domain}/careers/${slug(role)}`;
      source = `${p.name} careers page`;
      break;
    case "job_posting_stale":
      label ??= `${role} posting open ${seed.ageDays + 31} days, reposted`;
      evidenceUrl = `https://${p.domain}/careers/${slug(role)}`;
      source = `${p.name} careers page`;
      break;
    case "funding_round":
      label ??= ctx.funding ? `Raised a ${formatAmount(ctx.funding.amountEur)} ${ctx.funding.round}` : "Raised a new round";
      evidenceUrl = `https://${NEWS_SITE.domain}/${slug(p.name)}-raises-${slug(ctx.funding?.round ?? "round")}`;
      source = NEWS_SITE.name;
      break;
    case "new_leader":
      label ??= "New CTO joined";
      evidenceUrl = `https://${p.domain}/blog/welcome-our-new-leader`;
      source = `${p.name} blog`;
      break;
    case "headcount_growth":
      label ??= "Headcount up 30% in 6 months";
      evidenceUrl = `https://${p.domain}/about/team`;
      source = `${p.name} team page`;
      break;
    case "expansion":
      label ??= "Opening a second office";
      evidenceUrl = `https://${p.domain}/blog/new-office`;
      source = `${p.name} blog`;
      break;
    case "layoffs":
      label ??= "Reported a 15% reduction in staff";
      evidenceUrl = `https://${NEWS_SITE.domain}/${slug(p.name)}-cuts-staff`;
      source = NEWS_SITE.name;
      break;
    default:
      label ??= seed.type;
  }
  return { id: newId("sg"), type: seed.type, label, date, evidenceUrl, source, points: 0 };
}

export function candidateSignal(today: string, c: { name: string; currentEmployer: string; currentTitle: string; tenureMonths: number }, seed: SignalSeed): Signal {
  const date = addDays(today, -seed.ageDays);
  const profileUrl = `https://people.example.com/${slug(c.name)}`;
  let label = seed.label;
  let evidenceUrl = profileUrl;
  let source = "Public professional profile";
  switch (seed.type) {
    case "tenure_sweet_spot":
      label ??= `${formatTenure(c.tenureMonths)} at ${c.currentEmployer}, a typical move window`;
      break;
    case "employer_turbulence":
      label ??= `${c.currentEmployer} announced a restructuring`;
      evidenceUrl = `https://${NEWS_SITE.domain}/${slug(c.currentEmployer)}-news`;
      source = NEWS_SITE.name;
      break;
    case "title_stagnation":
      label ??= `Same title for ${Math.max(3, Math.floor(c.tenureMonths / 12))} years`;
      break;
    case "recently_started":
      label ??= `Started at ${c.currentEmployer} ${Math.max(1, c.tenureMonths)} months ago`;
      break;
    case "recently_promoted":
      label ??= `Promoted to ${c.currentTitle}`;
      break;
    default:
      label ??= seed.type;
  }
  return { id: newId("sg"), type: seed.type, label, date, evidenceUrl, source, points: 0 };
}

/* ------------------------------------------------------------------ */
/* Prospects                                                           */
/* ------------------------------------------------------------------ */

export interface ProspectSeedOptions {
  /**
   * "focused" (default): the agents' targeted search, mostly on target (scheduled runs, find more
   * like). "wide": a Test Run's first, broader search, where a realistic share of the companies looked
   * at miss on one or more criteria (sector, size, location, funding stage) and post fewer target roles.
   */
  breadth?: "focused" | "wide";
}

/** Sectors a wide search also looks at (kept only when they are no match for the Niche). */
const OFF_SECTORS = ["Proptech", "E-commerce", "Logistics", "Edtech", "Legaltech", "Gaming", "Martech", "HR tech", "Cybersecurity", "Climate tech"];
/** Cities outside the EU, for Niches whose locations cover every EU city ("Remote EU"). */
const NON_EU_CITIES: { city: string; country: string }[] = [
  { city: "London", country: "United Kingdom" },
  { city: "Zurich", country: "Switzerland" },
  { city: "Oslo", country: "Norway" },
  { city: "Toronto", country: "Canada" },
];
/** Roles a company may post that are not the Niche's (kept only when they are no match). */
const OFF_TARGET_ROLES = ["Account Executive", "Customer Success Manager", "Sales Development Representative", "Marketing Manager", "Finance Controller"];
/** Funding stages in order; a stage next to a wanted one is only a partial miss. */
const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E"];

/** Where a wide search lands: which criteria the company misses. */
interface WideMisses {
  sector: boolean;
  size: boolean;
  location: boolean;
  round: boolean;
}

/**
 * A wide search returns many companies outside the Niche: each criterion is missed independently (about
 * 55% miss the sector, half the size, 45% the location, 40% the funding stage), and every miss is a clear
 * one where possible (outside the range, not next to it). With the default Fit threshold, 25-45% of the
 * companies looked at end above it, like the Test Runs of the Established workspace. "Any stage" cannot
 * be missed, so size and location are missed a little more often there.
 */
function wideMisses(profile: NicheProfile, rng: Rng): WideMisses {
  const anyStage = profile.fundingStages.length === 0;
  return {
    sector: rng.chance(0.55),
    size: rng.chance(anyStage ? 0.58 : 0.5),
    location: rng.chance(anyStage ? 0.52 : 0.45),
    round: !anyStage && rng.chance(0.4),
  };
}

/** Stages a wide search may land on outside the wanted ones, clear misses (not next to a wanted stage) first. */
function offStagesFor(wanted: string[]): string[] {
  const index = (s: string) => FUNDING_STAGES.indexOf(s);
  const outside = FUNDING_STAGES.filter((s) => !wanted.includes(s));
  const clear = outside.filter((s) => wanted.every((w) => index(w) < 0 || Math.abs(index(w) - index(s)) > 1));
  return clear.length > 0 ? clear : outside;
}

export function generateProspectSeed(state: AppState, niche: Niche, rng: Rng, options: ProspectSeedOptions = {}): ProspectSeed {
  const profile = niche.profile;
  const family = sectorFamily(profile.sectors);
  const name = companyName(state, family, rng);
  const domain = `${slug(name)}.${rng.pick(["io", "com", "fr", "eu", "co"])}`;
  const mainSector = profile.sectors[0] ? capitalize(profile.sectors[0]) : "Software";
  const { min, max } = profile.companySize;
  const stages = profile.fundingStages.length > 0 ? profile.fundingStages : ["Series A", "Series B"];
  const miss: WideMisses | null = options.breadth === "wide" ? wideMisses(profile, rng) : null;
  let sector: string;
  let headcount: number;
  let location: string;
  let round: string;
  if (!miss) {
    sector = rng.chance(0.88) ? mainSector : capitalize(rng.pick(["Insurtech", "Proptech", "E-commerce", "Logistics"]));
    headcount = rng.chance(0.8) ? rng.int(Math.max(5, min), Math.max(min + 5, max)) : rng.int(Math.round(max * 1.25), Math.round(max * 2));
    location = pickLocation(profile, rng);
    round = rng.chance(0.85) ? rng.pick(stages) : rng.pick(["Seed", "Series D"]);
  } else {
    const offSectors = OFF_SECTORS.filter((s) => sectorMatch([s], profile.sectors) === "no");
    sector = miss.sector && offSectors.length > 0 ? rng.pick(offSectors) : profile.sectors.length > 0 ? capitalize(rng.pick(profile.sectors)) : mainSector;
    // Clearly outside the range: under 70% of the minimum or over 130% of the maximum.
    const tooSmall = Math.ceil(min * 0.7) - 1;
    if (!miss.size) headcount = rng.int(Math.max(5, min), Math.max(min + 5, max));
    else if (tooSmall >= 2 && rng.chance(0.4)) headcount = rng.int(Math.max(2, Math.round(min * 0.25)), tooSmall);
    else headcount = rng.int(Math.floor(max * 1.3) + 1, Math.round(max * 3));
    // A clear miss when one exists; "Remote EU" can only be missed partly (a city outside the EU).
    const cities = [...EU_CITIES, ...NON_EU_CITIES];
    const clearCities = cities.filter((c) => locationMatch(`${c.city}, ${c.country}`, profile.locations) === "no");
    const offCities = clearCities.length > 0 ? clearCities : cities.filter((c) => locationMatch(`${c.city}, ${c.country}`, profile.locations) !== "yes");
    if (miss.location && offCities.length > 0) {
      const c = rng.pick(offCities);
      location = `${c.city}, ${c.country}`;
    } else {
      location = pickLocation(profile, rng, 1);
    }
    const offStages = offStagesFor(stages);
    round = miss.round && offStages.length > 0 ? rng.pick(offStages) : rng.pick(stages);
  }
  const offTarget = miss !== null && (miss.sector || miss.size || miss.location || miss.round);
  const fundingAge = rng.int(8, 420);
  const funding = { round, amountEur: amountFor(round, rng), ageDays: fundingAge };
  const roleType = profile.roleTypes.length > 0 ? rng.pick(profile.roleTypes) : "Software Engineer";
  const seniority = profile.seniority.length > 0 ? rng.pick(profile.seniority) : "Senior";
  const roleTitle = `${seniority === "Mid-level" ? "" : `${seniority} `}${roleType}`.trim();
  const signals: SignalSeed[] = [];
  const roles: RoleSeed[] = [];
  if (fundingAge < 220) signals.push({ type: "funding_round", ageDays: fundingAge });
  // Off-target companies post the Niche's roles less often, and sometimes other roles only.
  const offRoles = OFF_TARGET_ROLES.filter((r) => roleMatch(r, profile.roleTypes) === "no");
  if (rng.chance(offTarget ? 0.2 : 0.7)) {
    const age = rng.int(1, 28);
    // A job posting is by definition the evidence of a Detected Role.
    signals.push({ type: "job_posting", ageDays: age, label: `Hiring a ${roleTitle}` });
    roles.push({ title: roleTitle, ageDays: age });
  } else if (offTarget && offRoles.length > 0 && rng.chance(0.3)) {
    const age = rng.int(1, 28);
    const other = rng.pick(offRoles);
    signals.push({ type: "job_posting", ageDays: age, label: `Hiring a ${other}` });
    roles.push({ title: other, ageDays: age });
  } else if (rng.chance(offTarget ? 0.1 : 0.4)) {
    const age = rng.int(5, 30);
    signals.push({ type: "job_posting_stale", ageDays: age, label: `${roleTitle} posting open ${age + 34} days, reposted` });
    roles.push({ title: roleTitle, ageDays: age + 34, stale: true });
  }
  if (rng.chance(0.3)) signals.push({ type: "new_leader", ageDays: rng.int(10, 120), label: rng.pick(["New CTO joined", "New VP Engineering joined", "New Head of Product joined"]) });
  if (rng.chance(0.4)) signals.push({ type: "headcount_growth", ageDays: rng.int(5, 60), label: `Headcount up ${rng.int(18, 55)}% in 6 months` });
  if (rng.chance(0.2)) signals.push({ type: "expansion", ageDays: rng.int(5, 90), label: `Opening an office in ${rng.pick(["Madrid", "Berlin", "Milan", "Amsterdam"])}` });
  if (rng.chance(0.08)) signals.push({ type: "layoffs", ageDays: rng.int(10, 120), label: `Reported a ${rng.int(8, 20)}% reduction in staff` });
  if (signals.length === 0) signals.push({ type: "headcount_growth", ageDays: rng.int(5, 40), label: `Headcount up ${rng.int(15, 35)}% in 6 months` });
  return {
    name,
    domain,
    sector,
    tags: [rng.pick(["B2B SaaS", "API-first", "Marketplace", "Infrastructure", "SMB"])],
    description: rng.pick(SECTOR_DESCRIPTIONS[miss?.sector ? "default" : family]),
    headcount,
    location,
    founded: rng.int(2014, 2023),
    funding,
    signals,
    roles,
  };
}

/** Creates a Prospect (shared company data) with its Detected Roles, then scores it. */
export function createProspect(state: AppState, nicheId: string, seed: ProspectSeed, surfacedOn: string): Prospect {
  const today = state.clock.today;
  const id = newId("pr");
  const funding = seed.funding ? { round: seed.funding.round, amountEur: seed.funding.amountEur, on: addDays(today, -seed.funding.ageDays) } : null;
  const fallbackRole = seed.roles[0]?.title;
  const p: Prospect = {
    id,
    nicheIds: [nicheId],
    name: seed.name,
    domain: seed.domain,
    sector: seed.sector,
    tags: seed.tags,
    description: seed.description,
    headcount: seed.headcount,
    location: seed.location,
    founded: seed.founded,
    latestFunding: funding,
    fit: EMPTY_FIT,
    signals: seed.signals.map((s) => prospectSignal(today, seed, s, { roleTitle: postingRoleTitle(s.type, s.label) ?? fallbackRole, funding })),
    signalStrength: 0,
    breakdown: EMPTY_BREAKDOWN,
    detectedRoleIds: [],
    hiringContactIds: [],
    status: "surfaced",
    closedUntil: null,
    dismissReason: null,
    dismissNote: null,
    hasNewSignal: false,
    surfacedOn,
  };
  state.prospects.push(p);
  for (const r of seed.roles) {
    const role: DetectedRole = {
      id: newId("dr"),
      prospectId: id,
      title: r.title,
      location: seed.location,
      postedOn: addDays(today, -r.ageDays),
      sourceUrl: `https://${seed.domain}/careers/${slug(r.title)}`,
      stale: r.stale ?? r.ageDays > 30,
      sourcedCandidateIds: [],
      sourcedPreviewIds: [],
      sourcing: { status: "idle", jobId: null, lastSourcedOn: null },
    };
    state.detectedRoles.push(role);
    p.detectedRoleIds.push(role.id);
  }
  // Every job posting Signal is the evidence of a Detected Role (CONTEXT.md).
  for (const s of p.signals) ensureDetectedRoleForSignal(state, p, s, false);
  rescoreProspect(state, p);
  return p;
}

/** The role title a job posting Signal is about: "Hiring a Senior Platform Engineer" -> "Senior Platform Engineer". */
export function postingRoleTitle(type: SignalType, label: string | undefined): string | undefined {
  if (!label || (type !== "job_posting" && type !== "job_posting_stale")) return undefined;
  const hiring = label.match(/^Hiring an? (.+)$/i);
  if (hiring) return hiring[1].trim();
  const stale = label.match(/^(.+?) posting open \d+ days/i);
  if (stale) return stale[1].trim();
  return label.trim();
}

/**
 * Creates the Detected Role a job posting Signal is the evidence of, unless the Prospect already has a
 * role with that title. Returns the role (new or existing), or null for other Signals.
 */
export function ensureDetectedRoleForSignal(state: AppState, p: Prospect, signal: Signal, rescore = true): DetectedRole | null {
  const title = postingRoleTitle(signal.type, signal.label);
  if (!title) return null;
  const existing = state.detectedRoles.find((r) => r.prospectId === p.id && r.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing;
  // A stale posting says how long it has been open: "... posting open 43 days, reposted".
  const openDays = signal.type === "job_posting_stale" ? Number(signal.label.match(/open (\d+) days/i)?.[1] ?? NaN) : NaN;
  const postedOn = Number.isFinite(openDays) ? addDays(state.clock.today, -openDays) : signal.date;
  const role: DetectedRole = {
    id: newId("dr"),
    prospectId: p.id,
    title,
    location: p.location,
    postedOn,
    sourceUrl: signal.evidenceUrl,
    // Open more than 30 days or reposted.
    stale: signal.type === "job_posting_stale" || diffDays(state.clock.today, postedOn) > 30,
    sourcedCandidateIds: [],
    sourcedPreviewIds: [],
    sourcing: { status: "idle", jobId: null, lastSourcedOn: null },
  };
  state.detectedRoles.push(role);
  p.detectedRoleIds.push(role.id);
  if (rescore) rescoreProspect(state, p);
  return role;
}

/* ------------------------------------------------------------------ */
/* Hiring Contacts                                                     */
/* ------------------------------------------------------------------ */

export function hiringContactTitles(niche: Niche): string[] {
  const roles = norm(niche.profile.roleTypes.join(" "));
  if (/design|ux|product/.test(roles)) return HIRING_CONTACT_TITLES_DESIGN;
  if (/engineer|developer|data|platform|devops/.test(roles)) return HIRING_CONTACT_TITLES_TECH;
  return HIRING_CONTACT_TITLES_GENERIC;
}

export function generateHiringContactSeeds(state: AppState, niche: Niche, prospect: Prospect, count: number, rng: Rng): HiringContactSeed[] {
  const titles = hiringContactTitles(niche);
  const language = languageFor(prospect.location);
  const used = new Set<string>();
  const out: HiringContactSeed[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      name: personName(state, rng, language, used),
      title: titles[i % titles.length],
      rank: i + 1,
      location: prospect.location,
      language,
      yearsInRole: rng.int(1, 6),
    });
  }
  return out;
}

export function createHiringContact(state: AppState, prospect: Prospect, seed: HiringContactSeed, surfacedOn: string): HiringContact {
  const h: HiringContact = {
    id: newId("hc"),
    prospectId: prospect.id,
    name: seed.name,
    title: seed.title,
    rank: seed.rank,
    location: seed.location,
    language: seed.language,
    lifecycle: "surfaced",
    contactValues: [],
    claim: null,
    profileUrl: `https://${prospect.domain}/about/team#${slug(seed.name)}`,
    surfacedOn,
    origin: "agent",
    proposed: false,
    referredByReplyId: null,
    dismissReason: null,
  };
  state.hiringContacts.push(h);
  prospect.hiringContactIds.push(h.id);
  return h;
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

export function skillsFor(title: string, rng: Rng, n = 4): string[] {
  const entry = ROLE_SKILLS.find((r) => r.match.test(title));
  return rng.sample(entry ? entry.skills : DEFAULT_SKILLS, n);
}

function yearsForSeniority(seniority: string, rng: Rng): number {
  switch (seniority) {
    case "Junior":
      return rng.int(1, 2);
    case "Mid-level":
      return rng.int(3, 5);
    case "Senior":
      return rng.int(5, 10);
    case "Lead":
      return rng.int(7, 12);
    case "Staff":
    case "Principal":
      return rng.int(9, 15);
    default:
      return rng.int(10, 16);
  }
}

export function generateCandidateSeed(state: AppState, niche: Niche, rng: Rng, opts: { roleTitle?: string; location?: string } = {}): CandidateSeed {
  const profile = niche.profile;
  const family = sectorFamily(profile.sectors);
  const roleType = profile.roleTypes.length > 0 ? rng.pick(profile.roleTypes) : "Software Engineer";
  const seniority = profile.seniority.length > 0 && rng.chance(0.85) ? rng.pick(profile.seniority) : "Mid-level";
  let currentTitle = opts.roleTitle ?? `${seniority === "Mid-level" ? "" : `${seniority} `}${roleType}`.trim();
  if (!opts.roleTitle && /backend/i.test(currentTitle) && rng.chance(0.35)) currentTitle += rng.pick([" (Go)", " (Kotlin)", " - Payments"]);
  const location = opts.location ?? pickLocation(profile, rng);
  const language = languageFor(location);
  const matchingEmployers = EMPLOYERS.filter((e) => sectorFamily([e.sector]) === family);
  const employerPool = matchingEmployers.length > 0 && rng.chance(0.75) ? matchingEmployers : EMPLOYERS;
  const employer = rng.pick(employerPool);
  const tenureMonths = rng.chance(0.12) ? rng.int(2, 5) : rng.int(10, 52);
  const yearsExperience = Math.max(Math.ceil(tenureMonths / 12), yearsForSeniority(seniorityOf(currentTitle), rng));
  const skills = skillsFor(currentTitle, rng, rng.int(3, 5));
  const prevEmployer = rng.pick(EMPLOYERS.filter((e) => e.name !== employer.name));
  const previous = [
    {
      employer: prevEmployer.name,
      employerSector: prevEmployer.sector,
      title: currentTitle.replace(/^(Senior|Staff|Lead|Principal)\s+/, ""),
      months: rng.int(18, 40),
    },
  ];
  if (yearsExperience > 6) {
    const e3 = rng.pick(EMPLOYERS.filter((e) => e.name !== employer.name && e.name !== prevEmployer.name));
    previous.push({ employer: e3.name, employerSector: e3.sector, title: rng.pick(["Software Engineer", "Developer", "Product Designer", "Consultant"]), months: rng.int(14, 30) });
  }
  const signals: SignalSeed[] = [];
  if (tenureMonths >= TENURE_SWEET_SPOT_MONTHS.min && tenureMonths <= TENURE_SWEET_SPOT_MONTHS.max) signals.push({ type: "tenure_sweet_spot", ageDays: rng.int(0, 70) });
  if (rng.chance(0.4)) signals.push({ type: "employer_turbulence", ageDays: rng.int(3, 80), label: `${employer.name} ${rng.pick(TURBULENCE_EVENTS)}` });
  if (tenureMonths > 36 && rng.chance(0.6)) signals.push({ type: "title_stagnation", ageDays: rng.int(10, 120) });
  if (tenureMonths < 6) signals.push({ type: "recently_started", ageDays: tenureMonths * 30 });
  else if (rng.chance(0.08)) signals.push({ type: "recently_promoted", ageDays: rng.int(20, 120) });
  if (signals.length === 0) signals.push({ type: "employer_turbulence", ageDays: rng.int(5, 40), label: `${employer.name} ${rng.pick(TURBULENCE_EVENTS)}` });
  return {
    name: personName(state, rng, language),
    language,
    location,
    currentTitle,
    currentEmployer: employer.name,
    employerSector: employer.sector,
    tenureMonths,
    yearsExperience,
    skills,
    previous,
    signals,
  };
}

export function createCandidate(state: AppState, nicheId: string, seed: CandidateSeed, surfacedOn: string, forDetectedRoleId: string | null = null): Candidate {
  const today = state.clock.today;
  const startOfCurrent = addDays(today, -Math.round(seed.tenureMonths * 30.4));
  const history: WorkHistoryEntry[] = [
    { employer: seed.currentEmployer, employerSector: seed.employerSector, title: seed.currentTitle, from: startOfCurrent, to: null },
  ];
  let cursor = startOfCurrent;
  for (const p of seed.previous) {
    const from = addDays(cursor, -Math.round(p.months * 30.4));
    history.push({ employer: p.employer, employerSector: p.employerSector, title: p.title, from, to: addDays(cursor, -1) });
    cursor = from;
  }
  const c: Candidate = {
    id: newId("ca"),
    nicheIds: [nicheId],
    name: seed.name,
    headline: `${seed.currentTitle} at ${seed.currentEmployer} - ${seed.skills.slice(0, 3).join(", ")}`,
    currentTitle: seed.currentTitle,
    currentEmployer: seed.currentEmployer,
    seniority: seniorityOf(seed.currentTitle),
    location: seed.location,
    language: seed.language,
    tenureMonths: seed.tenureMonths,
    yearsExperience: seed.yearsExperience,
    skills: seed.skills,
    workHistory: history,
    fit: EMPTY_FIT,
    signals: seed.signals.map((s) => candidateSignal(today, seed, s)),
    signalStrength: 0,
    breakdown: EMPTY_BREAKDOWN,
    lifecycle: "surfaced",
    contactValues: [],
    surfacedOn,
    deleteOn: addDays(surfacedOn, RETENTION.surfacedCandidateDays),
    consent: null,
    consentRecordedOn: null,
    retainUntil: null,
    article14NoticeSentOn: null,
    claim: null,
    forDetectedRoleId,
    profileUrl: `https://people.example.com/${slug(seed.name)}`,
    dismissReason: null,
    dismissNote: null,
  };
  state.candidates.push(c);
  rescoreCandidate(state, c);
  return c;
}

/* ------------------------------------------------------------------ */
/* Contact values (Enrichment)                                         */
/* ------------------------------------------------------------------ */

export function phoneFor(language: Language, rng: Rng): string {
  const two = () => String(rng.int(10, 99));
  if (language === "fr") return `+33 6 39 98 ${two()} ${two()}`;
  return `+49 1525 ${rng.int(100, 999)} ${rng.int(1000, 9999)}`;
}

export function emailFor(name: string, domain: string, variant = 0): string {
  const [first, ...rest] = name.split(" ");
  const last = rest.join("");
  const f = asciiLocal(first);
  const l = asciiLocal(last);
  if (variant === 1) return `${f[0]}${l}@${domain}`;
  if (variant === 2) return `${f}@${domain}`;
  return `${f}.${l}@${domain}`;
}

/** Finds one contact value for a person, with Provenance. Returns null when nothing verifiable is found. */
export function findContactValue(
  state: AppState,
  person: HiringContact | Candidate,
  personKind: "hiring_contact" | "candidate",
  kind: ContactKind,
  attempt = 0,
): ContactValue | null {
  const rng = rngFor("enrich", person.id, kind, attempt);
  const today = state.clock.today;
  if (kind === "mobile") {
    if (!rng.chance(0.82)) return null;
    const provider = rng.chance(0.5) ? "bettercontact" : "fullenrich";
    return {
      id: newId("cv"),
      kind,
      value: phoneFor(person.language, rng),
      verification: "valid",
      provenance: { provider, method: "provider_waterfall", sourceUrl: `https://app.${provider}.example/records/${person.id}-m`, foundOn: today },
      creditsCharged: 0,
    };
  }
  if (personKind === "hiring_contact") {
    const hc = person as HiringContact;
    const prospect = state.prospects.find((p) => p.id === hc.prospectId);
    const domain = prospect?.domain ?? "example.com";
    if (attempt > 0) {
      if (!rng.chance(0.55)) return null;
      const provider = attempt === 1 ? "fullenrich" : "bettercontact";
      return {
        id: newId("cv"),
        kind: "work_email",
        value: emailFor(person.name, domain, 1),
        verification: "valid",
        provenance: { provider, method: "provider_waterfall", sourceUrl: `https://app.${provider}.example/records/${person.id}-${attempt}`, foundOn: today },
        creditsCharged: 0,
      };
    }
    if (!rng.chance(0.94)) return null;
    const viaExa = rng.chance(0.45);
    return {
      id: newId("cv"),
      kind: "work_email",
      value: emailFor(person.name, domain),
      verification: rng.chance(0.85) ? "valid" : "catch_all",
      provenance: viaExa
        ? { provider: "exa", method: "cited_public_page", sourceUrl: `https://${domain}/about/team`, foundOn: today }
        : { provider: "dropcontact", method: "pattern_and_smtp_check", sourceUrl: `https://app.dropcontact.example/records/${person.id}`, foundOn: today },
      creditsCharged: 0,
    };
  }
  if (!rng.chance(attempt > 0 ? 0.5 : 0.9)) return null;
  const viaExa = attempt === 0 && rng.chance(0.4);
  const provider = viaExa ? "exa" : attempt === 1 ? "bettercontact" : "fullenrich";
  return {
    id: newId("cv"),
    kind: "personal_email",
    value: emailFor(person.name, rng.pick(PERSONAL_EMAIL_DOMAINS), attempt),
    verification: rng.chance(0.9) ? "valid" : "catch_all",
    provenance: viaExa
      ? { provider: "exa", method: "cited_public_page", sourceUrl: `https://people.example.com/${slug(person.name)}`, foundOn: today }
      : { provider, method: "provider_waterfall", sourceUrl: `https://app.${provider}.example/records/${person.id}-${attempt}`, foundOn: today },
    creditsCharged: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Previews (free trial)                                               */
/* ------------------------------------------------------------------ */

/** "fintech" for "Fintech", but acronyms and mixed case stay as they are ("SaaS", "B2B SaaS"). */
function sectorPhrase(sector: string): string {
  return /[A-Z]/.test(sector.slice(1)) ? sector : sector.toLowerCase();
}

function strengthPhrase(strength: number): string {
  if (strength >= 60) return "strong move signals";
  if (strength >= 35) return "some move signals";
  return "weak move signals";
}

/** Removes names (the person, their employers) from a Preview's explanation line. */
function anonymise(text: string, seed: CandidateSeed): string {
  let out = text.split(seed.name).join("this person").split(seed.currentEmployer).join("current employer");
  for (const p of seed.previous) out = out.split(p.employer).join("a previous employer");
  return capitalize(out);
}

interface PreviewScores {
  fit: Fit;
  signalStrength: number;
  breakdown: SignalBreakdown;
  labels: string[];
}

function previewCandidateScores(state: AppState, niche: Niche, seed: CandidateSeed): PreviewScores {
  // Score a throwaway Candidate built from the seed without storing it.
  const before = state.candidates.length;
  const c = createCandidate(state, niche.id, seed, state.clock.today);
  state.candidates.splice(before, 1);
  const clean = (t: string) => anonymise(t, seed);
  return {
    fit: { ...c.fit, reasons: c.fit.reasons.map((r) => ({ ...r, label: clean(r.label) })), summary: clean(c.fit.summary) },
    signalStrength: c.signalStrength,
    breakdown: { ...c.breakdown, lines: c.breakdown.lines.map((l) => ({ ...l, label: clean(l.label) })) },
    labels: c.signals.map((s) => clean(s.label)),
  };
}

/**
 * A Candidate Preview (free trial): anonymised, with its explanation. Returns null when the person is
 * below the Niche's Fit threshold (Previews follow the same rule as stored Candidates).
 */
export function createCandidatePreview(
  state: AppState,
  niche: Niche,
  rng: Rng,
  forDetectedRoleId: string | null = null,
  roleTitle?: string,
  givenSeed?: CandidateSeed,
): Preview | null {
  const seed = givenSeed ?? generateCandidateSeed(state, niche, rng, { roleTitle });
  const scores = previewCandidateScores(state, niche, seed);
  if (!scores.fit.aboveThreshold) return null;
  const city = seed.location.split(",")[0];
  const preview: Preview = {
    id: newId("pv"),
    kind: "candidate",
    nicheId: niche.id,
    prospectId: null,
    forDetectedRoleId,
    summary: `${seed.currentTitle}, ${seed.yearsExperience} years, ${sectorPhrase(seed.employerSector)}, ${city} - ${strengthPhrase(scores.signalStrength)}`,
    fit: scores.fit.score,
    signalStrength: scores.signalStrength,
    signalLabels: scores.labels,
    breakdown: scores.breakdown,
    fitDetail: scores.fit,
    title: seed.currentTitle,
    seniority: seniorityOf(seed.currentTitle),
    location: seed.location,
    years: seed.yearsExperience,
    createdOn: state.clock.today,
  };
  holder().previewSeeds[preview.id] = { kind: "candidate", seed };
  state.previews.push(preview);
  return preview;
}

export function createHiringContactPreview(state: AppState, niche: Niche, prospect: Prospect, seed: HiringContactSeed): Preview {
  const level = /CEO|CTO|Chief|COO|founder/i.test(seed.title) ? "C-level" : /VP|Head/i.test(seed.title) ? "VP or Head-level" : "Manager-level";
  const area = /talent|people/i.test(seed.title) ? "talent leader" : /design|product/i.test(seed.title) ? "product leader" : /engineer|CTO/i.test(seed.title) ? "engineering leader" : "executive";
  const preview: Preview = {
    id: newId("pv"),
    kind: "hiring_contact",
    nicheId: niche.id,
    prospectId: prospect.id,
    forDetectedRoleId: null,
    summary: `${level} ${area}, ${seed.yearsInRole} year${seed.yearsInRole === 1 ? "" : "s"} in role - rank ${seed.rank} to contact`,
    fit: prospect.fit.score,
    signalStrength: prospect.signalStrength,
    signalLabels: [],
    // A Hiring Contact is ranked with the Prospect's company data, which the free trial shows in full.
    breakdown: prospect.breakdown,
    fitDetail: prospect.fit,
    // Anonymised: the level and area, never the exact title at a named Prospect.
    title: `${level} ${area}`,
    seniority: level,
    location: prospect.location,
    years: seed.yearsInRole,
    createdOn: state.clock.today,
  };
  holder().previewSeeds[preview.id] = { kind: "hiring_contact", seed, prospectId: prospect.id };
  state.previews.push(preview);
  return preview;
}

/** Turns a Preview into a stored person (only once the Workspace has bought Credits). */
export function revealPreview(state: AppState, preview: Preview): HiringContact | Candidate | null {
  const stored = holder().previewSeeds[preview.id] as
    | { kind: "candidate"; seed: CandidateSeed }
    | { kind: "hiring_contact"; seed: HiringContactSeed; prospectId: string }
    | undefined;
  const niche = state.niches.find((n) => n.id === preview.nicheId);
  if (!niche) return null;
  const rng = rngFor("reveal", preview.id);
  if (preview.kind === "candidate") {
    const seed = stored && stored.kind === "candidate" ? stored.seed : generateCandidateSeed(state, niche, rng);
    if (state.candidates.some((c) => c.name === seed.name)) seed.name = personName(state, rng, seed.language);
    return createCandidate(state, niche.id, seed, state.clock.today, preview.forDetectedRoleId);
  }
  const prospect = state.prospects.find((p) => p.id === preview.prospectId);
  if (!prospect) return null;
  const seed = stored && stored.kind === "hiring_contact" ? stored.seed : generateHiringContactSeeds(state, niche, prospect, 1, rng)[0];
  if (state.hiringContacts.some((h) => h.name === seed.name)) seed.name = personName(state, rng, seed.language);
  return createHiringContact(state, prospect, seed, state.clock.today);
}
