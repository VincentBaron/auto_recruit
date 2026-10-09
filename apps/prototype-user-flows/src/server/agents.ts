// Canned conversational agents: the Niche setup agent (variant A "Chat" and Wizard suggestions)
// and the chat panel agent, which answers and proposes actions with their Credit cost.

import type {
  AppState,
  BreakdownLine,
  CampaignInput,
  Candidate,
  ChatMessage,
  ChatProposal,
  FeedItemRef,
  Niche,
  NicheProfile,
  NicheSuggestions,
  NicheWizardInput,
  Prospect,
  SetupMessage,
} from "@/lib/types";
import { CREDIT_PACKS, packPrice, PLACEHOLDER_PRICE_HINT, PRICES, revealCost, revealedPeopleText } from "@/lib/pricing";
import { formatCredits, formatCreditsLabel, formatDate, formatEuros, formatEurosCompact, formatNumber, formatTenure } from "@/lib/format";
import { nicheFieldLabel, nicheLabel, REPLY_CATEGORY_LABELS, TENURE_SWEET_SPOT_MONTHS } from "@/lib/labels";
import { byRank, rankedCandidates, rankedProspects } from "./derive";
import { currentRecruiter, firstName, recruiterName } from "./helpers";
import { newId } from "./runtime";
import { defaultSignalWeights, norm } from "./scoring";
import { TEST_RUN_SHOWN } from "./sim";

/* ------------------------------------------------------------------ */
/* Parsing a free-text Niche description                               */
/* ------------------------------------------------------------------ */

const SECTOR_KEYWORDS: [RegExp, string][] = [
  [/fin ?tech|neobank/i, "Fintech"],
  [/payments?\b/i, "Payments"],
  [/health ?tech|digital health|e-?sant[eé]/i, "Healthtech"],
  [/med ?tech|medical devices?/i, "Medtech"],
  [/insur ?tech|insurance/i, "Insurtech"],
  [/prop ?tech|real estate/i, "Proptech"],
  [/ed ?tech|education/i, "Edtech"],
  [/\bsaas\b|software/i, "B2B SaaS"],
  [/e-?commerce|retail/i, "E-commerce"],
  [/cyber ?security|security/i, "Cybersecurity"],
  [/climate|clean ?tech|energy/i, "Climate tech"],
  [/legal ?tech/i, "Legaltech"],
  [/logistics|supply chain/i, "Logistics"],
  [/gaming|video games/i, "Gaming"],
  [/bio ?tech/i, "Biotech"],
];

const ROLE_KEYWORDS: [RegExp, string][] = [
  [/back-?end/i, "Backend Engineer"],
  [/front-?end/i, "Frontend Engineer"],
  [/full-?stack/i, "Full-stack Engineer"],
  [/platform|devops|\bsre\b|infrastructure/i, "Platform Engineer"],
  [/data engineer/i, "Data Engineer"],
  [/data scien|machine learning|\bml\b/i, "Data Scientist"],
  [/product designers?|\bdesigners?\b|\bux\b/i, "Product Designer"],
  [/product managers?|\bpms?\b/i, "Product Manager"],
  [/account executives?|\bsales\b|\baes?\b/i, "Account Executive"],
  [/mobile|\bios\b|android/i, "Mobile Engineer"],
  [/engineering managers?/i, "Engineering Manager"],
];

const LOCATION_KEYWORDS: [RegExp, string][] = [
  [/paris|[iî]le-de-france/i, "Paris"],
  [/\blyon\b/i, "Lyon"],
  [/bordeaux/i, "Bordeaux"],
  [/nantes/i, "Nantes"],
  [/\blille\b/i, "Lille"],
  [/marseille/i, "Marseille"],
  [/toulouse/i, "Toulouse"],
  [/london/i, "London"],
  [/berlin/i, "Berlin"],
  [/munich/i, "Munich"],
  [/amsterdam/i, "Amsterdam"],
  [/madrid/i, "Madrid"],
  [/barcelona/i, "Barcelona"],
  [/lisbon/i, "Lisbon"],
  [/dublin/i, "Dublin"],
  [/stockholm/i, "Stockholm"],
  [/remote|anywhere in (the )?eu|across (the )?eu|europe/i, "Remote EU"],
  [/\bfrance\b/i, "France"],
];

const SENIORITY_KEYWORDS: [RegExp, string][] = [
  [/junior/i, "Junior"],
  [/mid-?level|\bmid\b|confirm[eé]/i, "Mid-level"],
  [/senior|\bsr\b/i, "Senior"],
  [/\bstaff\b/i, "Staff"],
  [/\blead\b/i, "Lead"],
  [/principal/i, "Principal"],
];

const STAGE_ORDER = ["Seed", "Series A", "Series B", "Series C", "Series D"];

interface ParsedNiche {
  sectors: string[];
  roleTypes: string[];
  locations: string[];
  seniority: string[];
  fundingStages: string[];
  companySize: { min: number; max: number } | null;
}

function collect(text: string, table: [RegExp, string][]): string[] {
  const out: string[] = [];
  for (const [re, value] of table) if (re.test(text) && !out.includes(value)) out.push(value);
  return out;
}

export function parseNicheText(text: string): ParsedNiche {
  const stages: string[] = [];
  // "Series A to C", "Seed to Series B": every stage in between counts.
  const seriesRange = text.match(/series\s*([a-d])\s*(?:-|to|à|through|and)\s*(?:series\s*)?([a-d])\b/i);
  const seedRange = text.match(/\bseed\s*(?:-|to|à|through|and)\s*series\s*([a-d])\b/i);
  const from = seriesRange ? seriesRange[1] : null;
  const to = seriesRange ? seriesRange[2] : seedRange ? seedRange[1] : null;
  if (to) {
    const a = from === null ? 0 : STAGE_ORDER.indexOf(`Series ${from.toUpperCase()}`);
    const b = STAGE_ORDER.indexOf(`Series ${to.toUpperCase()}`);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 0) stages.push(STAGE_ORDER[i]);
  } else {
    const singles = text.match(/series\s*([a-d])\b/gi) ?? [];
    for (const s of singles) {
      const v = `Series ${s.trim().slice(-1).toUpperCase()}`;
      if (!stages.includes(v)) stages.push(v);
    }
  }
  if (/\bseed\b/i.test(text) && !stages.includes("Seed")) stages.unshift("Seed");
  let companySize: { min: number; max: number } | null = null;
  const sizeRange = text.match(/(\d{1,5})\s*(?:-|to|à|and)\s*(\d{1,5})\s*(?:people|employees|staff|salari[eé]s|persons|ppl|fte)?/i);
  if (sizeRange && !/years?|ans/i.test(text.slice(sizeRange.index ?? 0, (sizeRange.index ?? 0) + sizeRange[0].length + 6))) {
    const a = Number(sizeRange[1]);
    const b = Number(sizeRange[2]);
    if (b > a && b >= 10) companySize = { min: a, max: b };
  }
  const atLeast = text.match(/(?:above|over|more than|at least|plus de)\s*(\d{1,5})\s*(?:people|employees|staff|salari[eé]s)/i);
  if (!companySize && atLeast) companySize = { min: Number(atLeast[1]), max: 2000 };
  const atMost = text.match(/(?:under|below|fewer than|less than|up to|moins de)\s*(\d{1,5})\s*(?:people|employees|staff|salari[eé]s)/i);
  if (!companySize && atMost && Number(atMost[1]) >= 10) companySize = { min: 1, max: Number(atMost[1]) };
  return {
    sectors: collect(text, SECTOR_KEYWORDS),
    roleTypes: collect(text, ROLE_KEYWORDS),
    locations: collect(text, LOCATION_KEYWORDS),
    seniority: collect(text, SENIORITY_KEYWORDS),
    fundingStages: stages,
    companySize,
  };
}

function stageLabel(stages: string[]): string {
  if (stages.length === 0) return "any stage";
  if (stages.length === 1) return stages[0];
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (first.startsWith("Series") && last.startsWith("Series")) return `Series ${first.slice(-1)}-${last.slice(-1)}`;
  return `${first} to ${last}`;
}

function listText(items: string[], empty: string): string {
  if (items.length === 0) return empty;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function nicheName(p: Pick<NicheProfile, "sectors" | "roleTypes" | "fundingStages" | "locations">): string {
  const sector = p.sectors[0] ?? "Tech";
  const role = (p.roleTypes[0] ?? "Engineer").toLowerCase();
  const parts = [`${sector} ${role}s`];
  if (p.fundingStages.length > 0) parts.push(stageLabel(p.fundingStages));
  parts.push(p.locations.length > 0 ? p.locations.join(", ").replace("Remote EU", "remote EU") : "Europe");
  return parts.join(" - ");
}

export function searchStrategyFor(p: Pick<NicheProfile, "sectors" | "companySize" | "fundingStages" | "locations" | "roleTypes" | "seniority" | "candidateProfile">): string[] {
  const sectors = listText(p.sectors, "target sectors");
  const locations = listText(p.locations, "Europe");
  const roles = listText(p.roleTypes, "target roles");
  return [
    `Companies in ${sectors} with ${p.companySize.min}-${p.companySize.max} people in ${locations}, ${stageLabel(p.fundingStages)}`,
    `Job postings for ${roles} published in the last 30 days, and postings reposted after 30 days`,
    `Funding announcements and new engineering or product leaders in ${sectors} over the last 90 days`,
    `People with ${listText(p.seniority, "senior")} ${roles} titles in ${locations}, ${TENURE_SWEET_SPOT_MONTHS.min} to ${TENURE_SWEET_SPOT_MONTHS.max} months in their current role`,
    `Employer news (restructuring, leadership exits, acquisitions) for Candidates' current employers`,
  ];
}

export function emptyProfile(): NicheProfile {
  return {
    sectors: [],
    companySize: { min: 20, max: 300 },
    fundingStages: [],
    locations: [],
    roleTypes: [],
    seniority: [],
    candidateProfile: "",
    fitThreshold: 60,
    signalWeights: defaultSignalWeights(),
    searchStrategy: [],
  };
}

export function suggestFromDescription(description: string): NicheSuggestions {
  const parsed = parseNicheText(description);
  const family = norm(parsed.sectors.join(" "));
  const roleTypes = parsed.roleTypes.length > 0 ? parsed.roleTypes : family.includes("health") ? ["Product Designer"] : ["Backend Engineer"];
  const isDesign = roleTypes.some((r) => /design/i.test(r));
  const base = {
    sectors: parsed.sectors.length > 0 ? parsed.sectors : ["Fintech"],
    companySize: parsed.companySize ?? { min: 20, max: 300 },
    fundingStages: parsed.fundingStages.length > 0 ? parsed.fundingStages : ["Series A", "Series B", "Series C"],
    locations: parsed.locations.length > 0 ? parsed.locations : ["Paris"],
    roleTypes: roleTypes.length === 1 && /backend/i.test(roleTypes[0]) ? [...roleTypes, "Platform Engineer"] : roleTypes,
    seniority: parsed.seniority.length > 0 ? parsed.seniority : ["Senior", "Staff", "Lead"],
    candidateProfile: isDesign
      ? "5+ years as a product designer, strong in Figma and design systems, has shipped B2B SaaS or healthcare products and run user research."
      : "5+ years building backend systems in Go, Kotlin or Python, ideally from payments, banking or fintech; has owned services in production.",
  };
  return { name: nicheName(base), ...base, searchStrategy: searchStrategyFor(base) };
}

/* ------------------------------------------------------------------ */
/* Setup agent (variant A "Chat")                                      */
/* ------------------------------------------------------------------ */

export type SetupStage = "basics" | "size" | "candidate" | "done";

export function greeting(state: AppState): SetupMessage {
  const me = currentRecruiter(state);
  return {
    id: newId("sm"),
    role: "agent",
    text: `Hi ${me ? firstName(me.name) : "there"}, I'm the setup agent. Describe the placements you make: sectors, roles, locations and seniority. A few lines is enough, I'll draft your Niche Profile as we go.`,
    on: state.clock.today,
    suggestions: [
      "I place senior backend engineers in Series A to C fintechs in Paris",
      "Product designers for healthtech startups, remote across the EU",
    ],
    updatedFields: [],
  };
}

/** Quick replies for the candidate profile, from the drafted roles and sector (never design ideas for engineers). */
function candidateProfileSuggestions(p: NicheProfile): string[] {
  const roles = norm(p.roleTypes.join(" "));
  const sector = (p.sectors[0] ?? "comparable").toLowerCase();
  const design = /design|\bux\b|\bui\b/.test(roles);
  const engineering = /engineer|developer|platform|devops|data|mobile|backend|frontend|full-stack/.test(roles);
  const out: string[] = [];
  if (engineering && !design) out.push(`5+ years, Go or Kotlin, ideally from ${sector}`);
  if (design && !engineering) out.push(`5+ years, Figma and design systems, ${sector} products`);
  out.push(`5+ years in the role, from a comparable ${sector} company`);
  return out;
}

/** The Niche Profile lists the setup agent edits from free text. */
type ListField = "sectors" | "roleTypes" | "locations" | "seniority" | "fundingStages";
const LIST_FIELDS: ListField[] = ["sectors", "roleTypes", "locations", "seniority", "fundingStages"];

function emptyLists(): Record<ListField, string[]> {
  return { sectors: [], roleTypes: [], locations: [], seniority: [], fundingStages: [] };
}

function sameValue(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

function hasValue(list: string[], value: string): boolean {
  return list.some((x) => sameValue(x, value));
}

/** Where a fragment after a keyword ends: punctuation, "but", "instead", or "and" starting a new instruction. */
const FRAGMENT_END = /[,.;!?]|\b(?:but|instead|rather)\b|\b(?:and|then)\s+(?:add|include|keep|make|use|also|focus|target|put|set|switch|go|change)\b/i;

function fragmentAfter(text: string): string {
  const m = text.match(FRAGMENT_END);
  return m ? text.slice(0, m.index) : text;
}

/** The fragment just before a keyword: from the last punctuation or conjunction. */
function fragmentBefore(text: string): string {
  const parts = text.split(/[,.;!?]|\b(?:but|and|then)\b/i);
  return parts[parts.length - 1];
}

function collectInto(target: Record<ListField, string[]>, fragment: string): void {
  const parsed = parseNicheText(fragment);
  for (const f of LIST_FIELDS) for (const v of parsed[f]) if (!hasValue(target[f], v)) target[f].push(v);
}

/**
 * Replacements and removals in the Recruiter's text: "Lyon instead of Paris", "replace Paris with
 * Lyon", "not Paris", "no Seed", "without medtech", "remove Paris", "drop Lyon".
 */
export function parseProfileEdits(text: string): { remove: Record<ListField, string[]>; add: Record<ListField, string[]> } {
  const remove = emptyLists();
  const add = emptyLists();
  for (const m of text.matchAll(/\binstead of\s+/gi)) {
    collectInto(add, fragmentBefore(text.slice(0, m.index)));
    collectInto(remove, fragmentAfter(text.slice(m.index + m[0].length)));
  }
  for (const m of text.matchAll(/\breplace\s+([^,.;!?]+?)\s+(?:with|by)\s+/gi)) {
    collectInto(remove, m[1]);
    collectInto(add, fragmentAfter(text.slice(m.index + m[0].length)));
  }
  // "not only fintech", "no more than 300 people": not a removal.
  for (const m of text.matchAll(/\b(?:not|no|without|remove|drop|exclude)\s+(?!(?:only|just|sure|really|more|less|over|under|much|too)\b)/gi)) {
    collectInto(remove, fragmentAfter(text.slice(m.index + m[0].length)));
  }
  // A value named on both sides ("replace Paris with Paris and Lyon") is kept.
  for (const f of LIST_FIELDS) remove[f] = remove[f].filter((v) => !hasValue(add[f], v));
  return { remove, add };
}

/** "Locations: Lyon instead of Paris", "Sectors: added Insurtech", "Seniority: removed Junior". */
function describeChange(field: ListField, added: string[], removed: string[]): string {
  const label = nicheFieldLabel(field);
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  if (added.length > 0 && removed.length > 0) return `${title}: ${listText(added, "")} instead of ${listText(removed, "")}`;
  if (added.length > 0) return `${title}: added ${listText(added, "")}`;
  return `${title}: removed ${listText(removed, "")}`;
}

/**
 * Applies the values named in the Recruiter's text to the profile lists: replaced and removed values
 * go first, then new values are added (a replacement takes the place of the value it replaces).
 * Returns the changed fields and a sentence per change.
 */
function applyProfileText(p: NicheProfile, text: string): { fields: string[]; changes: string[] } {
  const parsed = parseNicheText(text);
  const edits = parseProfileEdits(text);
  const fields: string[] = [];
  const changes: string[] = [];
  for (const f of LIST_FIELDS) {
    const before = p[f];
    const removed = before.filter((v) => hasValue(edits.remove[f], v));
    const kept = before.filter((v) => !removed.includes(v));
    const added: string[] = [];
    for (const v of [...edits.add[f], ...parsed[f]]) {
      if (!hasValue(edits.remove[f], v) && !hasValue(kept, v) && !hasValue(added, v)) added.push(v);
    }
    if (removed.length === 0 && added.length === 0) continue;
    // "Lyon instead of Paris" puts Lyon where Paris was.
    const at = removed.length > 0 ? Math.min(before.indexOf(removed[0]), kept.length) : kept.length;
    const next = [...kept.slice(0, at), ...added, ...kept.slice(at)];
    if (f === "fundingStages") next.sort((a, b) => stageIndex(a) - stageIndex(b));
    p[f] = next;
    fields.push(f);
    changes.push(describeChange(f, added, removed));
  }
  if (parsed.companySize && (parsed.companySize.min !== p.companySize.min || parsed.companySize.max !== p.companySize.max)) {
    p.companySize = parsed.companySize;
    fields.push("companySize");
    changes.push(`Company size: ${p.companySize.min}-${p.companySize.max} people`);
  }
  return { fields, changes };
}

function stageIndex(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? STAGE_ORDER.length : i;
}

/** The last sentence of a drafted Niche Profile: the free Test Run, or why the next one costs Credits. */
function testRunNextStep(state: AppState): string {
  const usedBy = state.workspace?.freeTestRunUsedBy ?? null;
  return usedBy ? `Review it, then run a Test Run: ${usedBy} already used its free one, so it costs Credits.` : "Review it, then launch your free Test Run.";
}

/** Applies the Recruiter's message to the draft profile and returns the agent's answer. */
export function setupAgentReply(state: AppState, niche: Niche, text: string): { reply: SetupMessage; updatedFields: string[]; complete: boolean } {
  const p = niche.profile;
  const parsed = parseNicheText(text);
  // The answer about the candidate profile describes people, not target companies: "4+ years in B2B
  // SaaS, remote" must not add a sector or a location.
  const describesCandidate = niche.setupStage === "candidate";
  const applied = describesCandidate ? { fields: [], changes: [] } : applyProfileText(p, text);
  const updated: string[] = [...applied.fields];
  // While drafting, a size the Recruiter states is confirmed even when it equals the default.
  if (parsed.companySize && !describesCandidate && niche.setupStage !== "done" && !updated.includes("companySize")) updated.push("companySize");
  const stage: SetupStage = niche.setupStage;
  let next: SetupStage = stage;
  let answer: string;
  let suggestions: string[] = [];

  if (stage === "basics") {
    const missing: string[] = [];
    if (p.sectors.length === 0) missing.push("sectors");
    if (p.roleTypes.length === 0) missing.push("roles");
    if (p.locations.length === 0) missing.push("locations");
    if (missing.length > 0) {
      answer = `Thanks. I still need the ${listText(missing, "")} you work on. For example: "fintech, backend engineers, Paris".`;
      suggestions = ["Fintech and payments, backend engineers, Paris", "Healthtech, product designers, remote EU"];
    } else {
      if (p.seniority.length === 0) {
        p.seniority = ["Senior", "Staff", "Lead"];
        updated.push("seniority");
      }
      answer = `Got it: ${listText(p.seniority, "")} ${listText(p.roleTypes, "")} in ${listText(p.sectors, "")}, ${listText(p.locations, "")}. Which company sizes and funding stages do you usually place into?`;
      suggestions = ["20 to 300 people, Series A to C", "50 to 500 people, any stage", "Seed and Series A, under 80 people"];
      next = "size";
      if (parsed.companySize || parsed.fundingStages.length > 0) {
        answer = `Got it: ${listText(p.roleTypes, "")} in ${listText(p.sectors, "")} with ${p.companySize.min}-${p.companySize.max} people, ${stageLabel(p.fundingStages)}, in ${listText(p.locations, "")}. What makes a Candidate a good Fit for you beyond the title? Years of experience, stack, industries they come from.`;
        suggestions = candidateProfileSuggestions(p);
        next = "candidate";
      }
    }
  } else if (stage === "size") {
    if (!parsed.companySize && parsed.fundingStages.length === 0) {
      answer = `I'll start with ${p.companySize.min}-${p.companySize.max} people at any stage; you can change it in the profile. What makes a Candidate a good Fit for you beyond the title?`;
    } else {
      answer = `Noted: ${p.companySize.min}-${p.companySize.max} people, ${stageLabel(p.fundingStages)}. What makes a Candidate a good Fit for you beyond the title? Years of experience, stack, industries they come from.`;
    }
    suggestions = candidateProfileSuggestions(p);
    next = "candidate";
  } else if (stage === "candidate") {
    p.candidateProfile = text.trim().length >= 12 ? text.trim() : p.candidateProfile || "5+ years in the role, from a comparable company.";
    updated.push("candidateProfile");
    p.searchStrategy = searchStrategyFor(p);
    updated.push("searchStrategy", "signalWeights", "fitThreshold");
    niche.name = nicheName(p);
    updated.push("name");
    answer = `Your Niche Profile is drafted. For Prospects I weighted funding rounds and fresh job postings highest; for Candidates, employer turbulence and a tenure of ${TENURE_SWEET_SPOT_MONTHS.min} to ${TENURE_SWEET_SPOT_MONTHS.max} months. People who just started or were just promoted count against. ${testRunNextStep(state)}`;
    next = "done";
    niche.setupComplete = true;
  } else {
    p.searchStrategy = searchStrategyFor(p);
    answer = applied.changes.length > 0 ? `Updated the Niche Profile. ${applied.changes.join(". ")}.` : "Nothing to change from that. You can edit any field directly in the Niche Profile.";
  }
  // The name follows the profile until the Recruiter renames the Niche.
  const namedFields = ["sectors", "roleTypes", "locations", "fundingStages"];
  if (!niche.nameCustomised && niche.name && updated.some((f) => namedFields.includes(f))) {
    const name = nicheName(p);
    if (name !== niche.name) {
      niche.name = name;
      if (!updated.includes("name")) updated.push("name");
      if (next === "done" && stage === "done") answer = `${answer} The Niche is now called "${name}".`;
    }
  }
  niche.setupStage = next;
  const reply: SetupMessage = { id: newId("sm"), role: "agent", text: answer, on: state.clock.today, suggestions, updatedFields: updated };
  return { reply, updatedFields: updated, complete: niche.setupComplete };
}

export function applyWizardInput(niche: Niche, input: NicheWizardInput): void {
  const p = niche.profile;
  p.sectors = input.sectors;
  p.companySize = input.companySize;
  p.fundingStages = input.fundingStages;
  p.locations = input.locations;
  p.roleTypes = input.roleTypes;
  p.seniority = input.seniority;
  p.candidateProfile = input.candidateProfile;
  p.searchStrategy = searchStrategyFor(p);
  const generated = nicheName(p);
  const chosen = input.name?.trim() ?? "";
  niche.name = chosen || generated;
  niche.nameCustomised = chosen.length > 0 && chosen !== generated;
  niche.setupComplete = true;
  niche.setupStage = "done";
}

/* ------------------------------------------------------------------ */
/* Chat panel agent                                                    */
/* ------------------------------------------------------------------ */

export interface ChatAnswer {
  text: string;
  proposal: Omit<ChatProposal, "id" | "status" | "resultText" | "creditsCharged"> | null;
  links: { label: string; href: string }[];
}

/** "Ledger x 0.91 = 27.3" lines, best contribution first. */
function explainLines(lines: BreakdownLine[]): string[] {
  return [...lines]
    .sort((a, b) => b.contribution - a.contribution)
    .map((l) => `${l.label} (${l.points} x ${l.decay.toFixed(2)} = ${l.contribution})`);
}

function findProspectByName(state: AppState, name: string) {
  const n = norm(name).replace(/[?.!]+$/, "").trim();
  return state.prospects.find((p) => norm(p.name) === n) ?? state.prospects.find((p) => norm(p.name).startsWith(n) || n.startsWith(norm(p.name)));
}

/** "fintechs" for a Fintech Prospect, "companies" otherwise. */
function companyWord(p: Prospect): string {
  return /tech$/i.test(p.sector) ? `${p.sector.toLowerCase()}s` : "companies";
}

/** "a, b or c". */
function listOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** "500 Credits for €99, 2 000 for €349 or 10 000 for €1 490", from the price config. */
function creditPacksText(): string {
  return listOr(CREDIT_PACKS.map((pack, i) => `${formatCredits(pack.credits)}${i === 0 ? " Credits" : ""} for ${formatEuros(packPrice(pack.credits).netEur)}`));
}

/** The Niche whose Test Run the free trial is about: the one that ran the free Test Run, else the latest one. */
function trialTestRunNiche(state: AppState): Niche | undefined {
  const withRun = state.niches.filter((n) => n.testRun !== null);
  return withRun.find((n) => n.testRun?.free) ?? withRun[withRun.length - 1];
}

const BUY_CREDITS_RE = /\b(?:buy|purchase|top.?up)\b.*\bcredits?\b|\bcredit packs?\b|\bhow (?:do|can) i (?:get|buy)\b/i;
const FREE_TRIAL_RE = /\bfree trial\b|\btrial\b|\bwhat(?:'s| is| does| do)?\b.*\binclud(?:e|es|ed)\b/i;

/** What the free trial gives, in the words of the landing page (ADR-0018). */
function freeTrialIncludes(): string {
  return `The free Test Run shows ${TEST_RUN_SHOWN} Prospects in full with their Signals and Detected Roles, and Hiring Contacts and Candidates as Previews (anonymised and never stored). Revealing people, Enrichment, more Prospects and Campaigns need Credits.`;
}

/**
 * What the first Credit pack charges to reveal the free trial's Previews: the normal price per Hiring
 * Contact found and per Surfaced Candidate, taken from the pack (ADR-0018). The same cost as the checkout.
 */
function revealCostSentence(state: AppState): string {
  const hiringContacts = state.previews.filter((p) => p.kind === "hiring_contact").length;
  const candidates = state.previews.filter((p) => p.kind === "candidate").length;
  if (hiringContacts + candidates === 0) {
    return `People found in the free trial are revealed at the normal price: ${formatCreditsLabel(PRICES.hiringContactFound)} per Hiring Contact found and ${formatCreditsLabel(PRICES.surfacedCandidate)} per Surfaced Candidate (${PLACEHOLDER_PRICE_HINT}).`;
  }
  const people = { hiringContacts, candidates };
  return `Your first pack reveals the ${revealedPeopleText(people)} shown as Previews for ${formatCreditsLabel(revealCost(people))} (${PLACEHOLDER_PRICE_HINT}), taken from the pack at the normal price.`;
}

/** A funding round named in the text: "Series D", "Seed", "Pre-seed". */
function roundNamed(text: string): string | null {
  const m = text.match(/\b(pre-?seed|seed|series\s+([a-h]))\b/i);
  if (!m) return null;
  if (/^pre/i.test(m[1])) return "Pre-seed";
  if (!m[2]) return "Seed";
  return `Series ${m[2].toUpperCase()}`;
}

function containsName(normText: string, name: string): boolean {
  const n = norm(name);
  if (n.length < 3) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normText);
}

/** The Prospect or Candidate the text names, the longest name first ("Léa Morel" before "Léa"). */
function namedRecord(state: AppState, text: string): { prospect: Prospect } | { candidate: Candidate } | null {
  const t = norm(text);
  const candidate = state.candidates.filter((c) => containsName(t, c.name)).sort((a, b) => b.name.length - a.name.length)[0];
  if (candidate) return { candidate };
  const prospect = state.prospects.filter((p) => containsName(t, p.name)).sort((a, b) => b.name.length - a.name.length)[0];
  return prospect ? { prospect } : null;
}

/** "Raised a €32M Series B (18 Sep 2026)": the top 3 Signals by contribution, with their dates. */
function topSignals(lines: BreakdownLine[]): string {
  const top = [...lines].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  return top.length > 0 ? top.map((l) => `${l.label} (${formatDate(l.date)})`).join("; ") : "none yet";
}

/** Facts about a Prospect, only from what is stored, and a correction when the text names another round. */
function prospectFacts(state: AppState, p: Prospect, text: string): ChatAnswer {
  const funding = p.latestFunding;
  const fundingText = funding ? `a ${funding.round} (${formatEurosCompact(funding.amountEur)}) on ${formatDate(funding.on)}` : null;
  const asked = roundNamed(text);
  const parts: string[] = [];
  if (asked && asked !== funding?.round) {
    parts.push(`I have no record of a ${asked} for ${p.name}: ${fundingText ? `its latest round is ${fundingText}` : "it has no funding round on record"}.`);
  }
  parts.push(`${p.name} (${p.domain}): ${p.sector}, ${formatNumber(p.headcount)} people, ${p.location}.`);
  if (fundingText && !(asked && asked !== funding?.round)) parts.push(`Latest funding: ${fundingText}.`);
  else if (!fundingText && !asked) parts.push("No funding round on record.");
  parts.push(`Top Signals: ${topSignals(p.breakdown.lines)}.`);
  const roles = state.detectedRoles.filter((r) => r.prospectId === p.id);
  parts.push(roles.length > 0 ? `Detected Roles: ${roles.map((r) => `${r.title}${r.stale ? " (open over 30 days)" : ""}`).join(", ")}.` : "No Detected Role yet.");
  parts.push(`Signal Strength ${p.signalStrength}, Fit ${p.fit.score}.`);
  return { text: parts.join(" "), proposal: null, links: [{ label: `Open ${p.name}`, href: `/prospects/${p.id}` }] };
}

function candidateFacts(c: Candidate): ChatAnswer {
  const parts = [
    `${c.name}: ${c.currentTitle} at ${c.currentEmployer}, ${c.location}, ${formatTenure(c.tenureMonths)} in the role.`,
    `Top Signals: ${topSignals(c.breakdown.lines)}.`,
    `Signal Strength ${c.signalStrength}, Fit ${c.fit.score}.`,
  ];
  return { text: parts.join(" "), proposal: null, links: [{ label: `Open ${c.name}`, href: `/candidates/${c.id}` }] };
}

export function chatAnswer(state: AppState, text: string, context?: { route?: string; selection?: FeedItemRef[] }): ChatAnswer {
  const t = text.trim();
  const ws = state.workspace;
  const signUp = { label: "Sign up", href: "/signup" };
  const buyCredits = { label: "Buy Credits", href: "/credits" };

  // Before sign-up there is nothing to act on: only what the free trial gives, and the way in.
  if (!ws) {
    if (FREE_TRIAL_RE.test(t)) {
      return {
        text: `The free trial gives you one free Test Run per Main Domain, with 0 Credits and no card. ${freeTrialIncludes()} ${revealCostSentence(state)} Sign up with a work account to start.`,
        proposal: null,
        links: [signUp],
      };
    }
    return { text: "Sign up to get a Workspace, then I can help with your Niches, Feed and Campaigns.", proposal: null, links: [signUp] };
  }

  const me = currentRecruiter(state);
  const paid = ws.plan === "paid";

  // "find 10 more fintechs like <Prospect>"
  const more = t.match(/(?:find|search|get|show)\s+(?:me\s+)?(\d+)?\s*(?:more\s+)?(.*?)\s*like\s+([^?.!]+)/i);
  if (more) {
    const count = Math.max(1, Math.min(25, Number(more[1] ?? 10)));
    const target = findProspectByName(state, more[3]);
    if (!target) return { text: `I couldn't find a Prospect called "${more[3].trim()}" in your Feed. Try the exact company name.`, proposal: null, links: [{ label: "Open the Feed", href: "/feed" }] };
    if (!paid) return { text: "Finding more Prospects spends Credits, and your Workspace is still on the free trial. Buy Credits first, then ask me again.", proposal: null, links: [buyCredits] };
    const cost = count * PRICES.surfacedProspect;
    return {
      text: `I can search for ${count} more companies like ${target.name} (${target.sector}, ${target.headcount} people, ${target.latestFunding?.round ?? "unknown stage"}, ${target.location.split(",")[0]}). Only those above your Fit threshold are Surfaced, at ${PRICES.surfacedProspect} Credit each.`,
      proposal: {
        title: `Find ${count} Prospects like ${target.name}`,
        description: `Up to ${formatCredits(cost)} Credits (${PRICES.surfacedProspect} per Surfaced Prospect). You are charged only for Prospects above the Fit threshold.`,
        costCredits: cost,
        contactsPeople: false,
        actionName: "findMoreLike",
        actionPayload: { prospectId: target.id, count },
      },
      links: [],
    };
  }

  // "enrich these 5"
  const enrich = t.match(/enrich\s+(?:these\s+|the\s+top\s+|top\s+)?(\d+)?/i);
  if (enrich) {
    if (!paid) return { text: "Enrichment spends Credits and the free trial only shows Previews. Buy Credits to reveal people and enrich them.", proposal: null, links: [buyCredits] };
    const n = Math.max(1, Math.min(20, Number(enrich[1] ?? context?.selection?.length ?? 5)));
    const selected = (context?.selection ?? []).filter((s) => s.kind !== "prospect");
    let people = selected.map((s) => ({ kind: s.kind as "candidate" | "hiring_contact", id: s.id }));
    let preface = "";
    if (people.length === 0) {
      // Nothing selected: the top Surfaced Candidates of this Recruiter's own Niches, never another Recruiter's.
      const myNiches = new Set(state.niches.filter((x) => x.ownerId === me?.id).map((x) => x.id));
      people = state.candidates
        .filter((c) => c.lifecycle === "surfaced" && c.fit.aboveThreshold && c.nicheIds.some((id) => myNiches.has(id)) && (!c.claim || c.claim.recruiterId === me?.id))
        .sort(byRank)
        .slice(0, n)
        .map((c) => ({ kind: "candidate" as const, id: c.id }));
      if (people.length > 0) preface = `Nothing is selected, so I took your top ${people.length} ${people.length === 1 ? "Candidate" : "Candidates"} by Signal Strength. `;
    }
    if (people.length === 0) return { text: "There is nobody left to enrich in your Niches right now.", proposal: null, links: [] };
    const names = people
      .map((p) => (p.kind === "candidate" ? state.candidates.find((c) => c.id === p.id)?.name : state.hiringContacts.find((h) => h.id === p.id)?.name))
      .filter(Boolean) as string[];
    const cost = people.length * PRICES.verifiedEmail;
    return {
      text: `${preface}I'll look for a verified email for ${names.join(", ")}. Candidates only get a personal email, never their work address. Mobile numbers are added per person from the Enrich dialog, never by default.`,
      proposal: {
        title: `Enrich ${people.length} ${people.length === 1 ? "person" : "people"} (email only)`,
        description: `Up to ${formatCredits(cost)} Credits (${PRICES.verifiedEmail} per verified email found). No Credits for emails not found.`,
        costCredits: cost,
        contactsPeople: false,
        actionName: "enrich",
        actionPayload: { people: people.map((p) => ({ ...p, mobile: false })) },
      },
      links: [],
    };
  }

  // "draft a Campaign for my fintech Niche"
  if (/draft\s+(?:a\s+)?campaign/i.test(t)) {
    if (!paid) {
      return {
        text: "Campaigns need Credits, and your Workspace is still on the free trial: people are Previews only, so there is nobody to email yet. Buy Credits first, then ask me again.",
        proposal: null,
        links: [buyCredits],
      };
    }
    const words = norm(t).split(/\W+/).filter((w) => w.length > 3 && !["draft", "campaign", "niche", "with", "from"].includes(w));
    const niches = state.niches.filter((n) => n.status === "active" || n.status === "testing");
    const own = (n: Niche) => n.ownerId === me?.id;
    // Of the Niches the words match, the Recruiter's own first; with no match, their own Niche.
    const matching = niches.filter((n) => words.some((w) => norm(n.name).includes(w)));
    const niche = matching.find(own) ?? matching[0] ?? niches.find(own) ?? niches[0];
    if (!niche) return { text: "You need a Niche first. Set one up and I'll draft Campaigns for it.", proposal: null, links: [{ label: "Set up a Niche", href: "/onboarding/niche" }] };
    const audience = /candidate/i.test(t) ? "candidates" : "hiring_contacts";
    const mailboxIds = state.mailboxes.filter((m) => m.recruiterId === me?.id && (m.status === "active" || m.status === "warming")).map((m) => m.id);
    const payload: CampaignInput = {
      nicheId: niche.id,
      name: `${niche.profile.sectors[0] ?? "Niche"} ${audience === "candidates" ? "Candidates" : "Hiring Contacts"} - drafted by chat`,
      audience,
      brief: {
        angle:
          audience === "candidates"
            ? `I work with ${niche.profile.sectors[0] ?? "tech"} companies hiring ${niche.profile.roleTypes[0] ?? "engineers"}, with salary bands shared upfront`
            : `I place ${niche.profile.roleTypes[0]?.toLowerCase() ?? "engineer"}s from comparable companies and have strong candidates available now`,
        callToAction: "a 15-minute call this week",
        detectedRoleId: null,
      },
      sequence: [
        { step: 1, delayDays: 0, instruction: "First email, one Signal as the hook" },
        { step: 2, delayDays: 4, instruction: "Short nudge with one new fact" },
      ],
      sendingWindow: { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "17:30", recipientTimezone: true },
      autonomy: "review_all",
      reviewFirstN: 5,
      mailboxIds,
      autoAddRule: null,
    };
    const audienceLabel = audience === "candidates" ? "Candidates" : "Hiring Contacts";
    const nicheText = own(niche) ? `"${niche.name}"` : `${recruiterName(state, niche.ownerId)}'s Niche "${niche.name}"`;
    const sentences = [`I'll draft a Campaign to ${audienceLabel} for ${nicheText} with a two-step Sequence and every email waiting for your review.`];
    if (!own(niche)) sentences.push("It is your Campaign, sent from your own Sending Mailboxes.");
    sentences.push("Nothing is sent until you add recipients, review the drafts and launch it.");
    if (mailboxIds.length === 0) sentences.push("Choose a Sending Mailbox before launching.");
    return {
      text: sentences.join(" "),
      proposal: {
        title: "Create a draft Campaign",
        description: "0 Credits now. Each email sent later costs 1 Credit.",
        costCredits: 0,
        contactsPeople: false,
        actionName: "createCampaign",
        actionPayload: payload,
      },
      links: [],
    };
  }

  // "How do I buy Credits?" (never "How many Credits do I have?", answered below).
  if (BUY_CREDITS_RE.test(t)) {
    const sentences = [`Open Credits and pick a pack: ${creditPacksText()} (placeholder prices, VAT added at checkout). You can also switch on auto top-up there.`];
    if (!paid) sentences.push(revealCostSentence(state), "Then you can switch the agents on.");
    return { text: sentences.join(" "), proposal: null, links: [buyCredits] };
  }

  // "What does the free trial include?"
  if (FREE_TRIAL_RE.test(t)) {
    if (paid) {
      return {
        text: `${ws.name} runs on Credits, not the free trial: the balance is ${formatCreditsLabel(ws.credits)}. Every Credit-spending action shows its cost before you confirm it.`,
        proposal: null,
        links: [{ label: "Open Credits", href: "/credits" }],
      };
    }
    const trialNiche = trialTestRunNiche(state);
    const ranOwnFree = state.niches.find((n) => n.testRun?.free);
    const first = !ws.freeTestRunUsedBy
      ? "The free trial gives you one free Test Run per Main Domain, with 0 Credits and no card."
      : ranOwnFree
        ? `You used your free Test Run on ${nicheLabel(ranOwnFree)}.`
        : `${ws.freeTestRunUsedBy} already used its free Test Run, so your next Test Run needs Credits.`;
    return {
      text: `${first} ${freeTrialIncludes()} ${revealCostSentence(state)}`,
      proposal: null,
      links: [buyCredits, trialNiche ? { label: "Open your Test Run", href: `/niches/${trialNiche.id}/test-run` } : { label: "Set up a Niche", href: "/onboarding/niche" }],
    };
  }

  if (/credit|balance/i.test(t)) {
    return {
      text: `${ws.name} has ${formatCredits(ws.credits)} Credits${ws.plan === "free_trial" ? " (free trial)" : ""}. Auto top-up is ${ws.autoTopUp.enabled ? `on: ${formatCredits(ws.autoTopUp.packCredits)} Credits when the balance drops below ${formatCredits(ws.autoTopUp.thresholdCredits)}` : "off"}.`,
      proposal: null,
      links: [{ label: "Open Credits", href: "/credits" }],
    };
  }

  if (/repl(y|ies)|inbox/i.test(t)) {
    const open = state.replies.filter((r) => !r.handled);
    if (open.length === 0) return { text: "No unhandled replies. Nice.", proposal: null, links: [{ label: "Open the Inbox", href: "/inbox" }] };
    const lines = open.slice(0, 6).map((r) => `${r.personLabel}: ${REPLY_CATEGORY_LABELS[r.category]}`);
    return { text: `You have ${open.length} unhandled replies. ${lines.join("; ")}. I never send replies myself: you send each response.`, proposal: null, links: [{ label: "Open the Inbox", href: "/inbox" }] };
  }

  // Only the leading word is case-insensitive: the name after it must start with a capital.
  const why = t.match(/[Ww]hy\s+(?:is\s+)?([A-Z][\wÀ-ÿ'-]+(?:\s+[A-Z][\wÀ-ÿ'-]+)?)/);
  if (why) {
    const name = why[1];
    const p = findProspectByName(state, name);
    const c = state.candidates.find((x) => norm(x.name).startsWith(norm(name)));
    const item = p ?? c;
    if (item) {
      // The real rank in the Feed tab: Signal Strength among items at or above the Fit threshold.
      const ranked: { id: string; name: string; signalStrength: number }[] = p ? rankedProspects(state) : rankedCandidates(state);
      const tab = p ? "Prospects" : "Candidates";
      const index = ranked.findIndex((x) => x.id === item.id);
      const rank =
        index === 0
          ? `${item.name} is first in the ${tab} tab.`
          : index > 0
            ? `${item.name} is #${index + 1} in the ${tab} tab; ${ranked[0].name} is first at ${ranked[0].signalStrength}.`
            : `${item.name} is not in the ${tab} tab: ${item.fit.aboveThreshold ? "it is no longer Surfaced" : `its Fit is below the threshold (${item.fit.threshold})`}.`;
      const lines = explainLines(item.breakdown.lines);
      return {
        text: `${rank} ${p ? "It has" : "They have"} a Signal Strength of ${item.signalStrength} and a Fit of ${item.fit.score}. Signals by contribution: ${lines.length > 0 ? lines.join("; ") : "none"}. ${item.fit.summary}.`,
        proposal: null,
        links: [{ label: `Open ${item.name}`, href: p ? `/prospects/${p.id}` : `/candidates/${item.id}` }],
      };
    }
  }

  // A question about a Prospect or Candidate by name: the stored facts, never invented ones.
  const named = namedRecord(state, t);
  if (named) return "prospect" in named ? prospectFacts(state, named.prospect, t) : candidateFacts(named.candidate);

  const top = rankedProspects(state)[0];
  const hello = me ? `, ${firstName(recruiterName(state, me.id))}` : "";
  if (!paid) {
    const tries = ["What does the free trial include?", "How do I buy Credits?", ...(top ? [`Explain why ${top.name} is ranked first`] : [])].map((x) => `"${x}"`);
    const about = trialTestRunNiche(state) ? "your Test Run results, what the trial includes and how to buy Credits" : "what the trial includes and how to buy Credits";
    return {
      text: `On the free trial I can explain ${about}${hello}. Try ${listOr(tries)}.`,
      proposal: null,
      links: [],
    };
  }
  const ownNiche = state.niches.find((n) => n.ownerId === me?.id && n.status === "active") ?? state.niches.find((n) => n.ownerId === me?.id && n.status === "testing");
  const sector = ownNiche?.profile.sectors[0]?.toLowerCase();
  const tries = [
    ...(top ? [`find 10 more ${companyWord(top)} like ${top.name}`] : []),
    "enrich these 5",
    ...(sector ? [`draft a Campaign for my ${sector} Niche`] : []),
    ...(top ? [`why is ${top.name} ranked first?`] : []),
    "how many Credits do I have?",
  ].map((x) => `"${x}"`);
  return {
    text: `I can help with your Niches, Feed and Campaigns${hello}. Try ${listOr(tries)}. I always show the Credit cost and ask before spending Credits or contacting anyone.`,
    proposal: null,
    links: [],
  };
}

export function chatMessage(state: AppState, role: ChatMessage["role"], text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: newId("ch"), role, text, on: state.clock.today, proposal: null, links: [], ...extra };
}
