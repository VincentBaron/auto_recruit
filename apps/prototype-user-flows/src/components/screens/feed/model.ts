// Pure Feed derivations from the client state: which items are in the Feed, their rank, filters,
// Claims, retention and Enrichment cost. No React, no Date: safe in render on server and client.

import { daysUntil, formatDate } from "@/lib/format";
import { PRICES, emailKindFor } from "@/lib/pricing";
import { RETENTION } from "@/lib/labels";
import { openDataRequestFor } from "@/lib/retention";
import type {
  AgentRun,
  Campaign,
  Candidate,
  Claim,
  ClientState,
  DetectedRole,
  FeedItemRef,
  HiringContact,
  ISODate,
  Niche,
  PersonKind,
  PersonRef,
  Preview,
  Prospect,
  Recruiter,
} from "@/lib/types";

export type FeedTab = "prospects" | "candidates";
export type FeedView = "open" | "dismissed";
export type FeedVariant = "A" | "B" | "C";
export type FeedSort = "signal" | "fit" | "surfaced" | "name";

export const VARIANTS: { key: FeedVariant; label: string }[] = [
  { key: "A", label: "Table" },
  { key: "B", label: "Split" },
  { key: "C", label: "Triage" },
];

export function parseVariant(v: string | null): FeedVariant {
  const up = (v ?? "").toUpperCase();
  return up === "B" || up === "C" ? up : "A";
}

export function parseTab(v: string | null): FeedTab {
  return v === "candidates" ? "candidates" : "prospects";
}

export function parseView(v: string | null): FeedView {
  return v === "dismissed" ? "dismissed" : "open";
}

/** "all", "mine" or a Niche id. */
export type NicheFilter = string;

export interface FeedFilters {
  tab: FeedTab;
  niche: NicheFilter;
  view: FeedView;
  query: string;
  sort: FeedSort;
}

export type FeedRow =
  | { kind: "prospect"; id: string; rank: number; prospect: Prospect }
  | { kind: "candidate"; id: string; rank: number; candidate: Candidate }
  | { kind: "preview"; id: string; rank: number; preview: Preview };

export function rowKey(row: Pick<FeedRow, "kind" | "id">): string {
  return `${row.kind}:${row.id}`;
}

export interface FeedModel {
  state: ClientState;
  today: ISODate;
  me: Recruiter | null;
  isFreeTrial: boolean;
  credits: number;
  nicheById: Map<string, Niche>;
  recruiterById: Map<string, Recruiter>;
  campaignById: Map<string, Campaign>;
  prospectById: Map<string, Prospect>;
  roleById: Map<string, DetectedRole>;
  rolesByProspect: Map<string, DetectedRole[]>;
  contactsByProspect: Map<string, HiringContact[]>;
  hcPreviewsByProspect: Map<string, Preview[]>;
}

/** Locale-independent text order: the same on the server and in every browser. */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** ISO dates (YYYY-MM-DD) order as plain strings, oldest first. */
export function compareIsoDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function buildModel(state: ClientState): FeedModel {
  const contacts = state.hiringContacts.filter((h) => h.lifecycle !== "dismissed");
  const contactsByProspect = group(contacts, (h) => h.prospectId);
  for (const list of contactsByProspect.values()) list.sort((a, b) => a.rank - b.rank || compareText(a.name, b.name));
  const hcPreviews = state.previews.filter((p) => p.kind === "hiring_contact" && p.prospectId);
  return {
    state,
    today: state.clock.today,
    me: state.derived.currentRecruiter,
    isFreeTrial: state.derived.isFreeTrial,
    credits: state.workspace?.credits ?? 0,
    nicheById: new Map(state.niches.map((n) => [n.id, n])),
    recruiterById: new Map(state.recruiters.map((r) => [r.id, r])),
    campaignById: new Map(state.campaigns.map((c) => [c.id, c])),
    prospectById: new Map(state.prospects.map((p) => [p.id, p])),
    roleById: new Map(state.detectedRoles.map((r) => [r.id, r])),
    rolesByProspect: group(state.detectedRoles, (r) => r.prospectId),
    contactsByProspect,
    hcPreviewsByProspect: group(hcPreviews, (p) => p.prospectId ?? ""),
  };
}

/* ------------------------------------------------------------------ */
/* Membership and filters                                              */
/* ------------------------------------------------------------------ */

const OPEN_PROSPECT = new Set(["surfaced", "in_campaign"]);
const OPEN_CANDIDATE = new Set(["surfaced", "enriched"]);

function nicheMatches(model: FeedModel, nicheIds: string[], filter: NicheFilter): boolean {
  if (filter === "all") return true;
  if (filter === "mine") {
    const me = model.me?.id;
    return nicheIds.some((id) => model.nicheById.get(id)?.ownerId === me);
  }
  return nicheIds.includes(filter);
}

function textMatches(query: string, values: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => (v ?? "").toLowerCase().includes(q));
}

function prospectInView(p: Prospect, view: FeedView): boolean {
  if (view === "dismissed") return p.status === "dismissed";
  return OPEN_PROSPECT.has(p.status) && p.fit.aboveThreshold;
}

function candidateInView(c: Candidate, view: FeedView): boolean {
  if (view === "dismissed") return c.lifecycle === "dismissed";
  return OPEN_CANDIDATE.has(c.lifecycle) && c.fit.aboveThreshold;
}

/** Candidate Previews (free trial only) never stored, never dismissable. */
function previewsInView(model: FeedModel, view: FeedView): Preview[] {
  if (!model.isFreeTrial || view === "dismissed") return [];
  return model.state.previews.filter((p) => p.kind === "candidate");
}

function compareRows(sort: FeedSort) {
  return (a: Scored, b: Scored): number => {
    switch (sort) {
      case "fit":
        return b.fit - a.fit || b.signal - a.signal || compareText(a.name, b.name);
      case "surfaced":
        return compareIsoDates(b.surfacedOn, a.surfacedOn) || b.signal - a.signal || compareText(a.name, b.name);
      case "name":
        return compareText(a.name, b.name);
      default:
        return b.signal - a.signal || b.fit - a.fit || compareText(a.name, b.name);
    }
  };
}

/** Omit applied to each member of a union (plain Omit collapses the union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RowSeed = DistributiveOmit<FeedRow, "rank">;

interface Scored {
  row: RowSeed;
  signal: number;
  fit: number;
  name: string;
  surfacedOn: ISODate;
}

/** Rows for the current tab, filtered, ranked by Signal Strength (rank always reflects Signal Strength). */
export function feedRows(model: FeedModel, f: FeedFilters): FeedRow[] {
  const scored: Scored[] = [];
  if (f.tab === "prospects") {
    for (const p of model.state.prospects) {
      if (!prospectInView(p, f.view) || !nicheMatches(model, p.nicheIds, f.niche)) continue;
      if (!textMatches(f.query, [p.name, p.domain, p.sector, p.location, ...p.tags])) continue;
      scored.push({ row: { kind: "prospect", id: p.id, prospect: p }, signal: p.signalStrength, fit: p.fit.score, name: p.name, surfacedOn: p.surfacedOn });
    }
  } else {
    for (const c of model.state.candidates) {
      if (!candidateInView(c, f.view) || !nicheMatches(model, c.nicheIds, f.niche)) continue;
      if (!textMatches(f.query, [c.name, c.currentTitle, c.currentEmployer, c.location, c.headline, ...c.skills])) continue;
      scored.push({ row: { kind: "candidate", id: c.id, candidate: c }, signal: c.signalStrength, fit: c.fit.score, name: c.name, surfacedOn: c.surfacedOn });
    }
    for (const pv of previewsInView(model, f.view)) {
      if (!nicheMatches(model, [pv.nicheId], f.niche)) continue;
      if (!textMatches(f.query, [pv.summary, ...pv.signalLabels])) continue;
      scored.push({ row: { kind: "preview", id: pv.id, preview: pv }, signal: pv.signalStrength, fit: pv.fit, name: pv.summary, surfacedOn: pv.createdOn });
    }
  }
  const bySignal = [...scored].sort(compareRows("signal"));
  const rankOf = new Map(bySignal.map((s, i) => [`${s.row.kind}:${s.row.id}`, i + 1]));
  const ordered = f.sort === "signal" ? bySignal : [...scored].sort(compareRows(f.sort));
  return ordered.map((s) => ({ ...s.row, rank: rankOf.get(`${s.row.kind}:${s.row.id}`) ?? 0 }) as FeedRow);
}

/** Counts for the tab labels and the view toggle, under the current Niche filter (ignores search). */
export function feedCounts(model: FeedModel, niche: NicheFilter): { prospects: number; candidates: number; dismissedProspects: number; dismissedCandidates: number } {
  let prospects = 0;
  let dismissedProspects = 0;
  for (const p of model.state.prospects) {
    if (!nicheMatches(model, p.nicheIds, niche)) continue;
    if (prospectInView(p, "open")) prospects++;
    else if (p.status === "dismissed") dismissedProspects++;
  }
  let candidates = 0;
  let dismissedCandidates = 0;
  for (const c of model.state.candidates) {
    if (!nicheMatches(model, c.nicheIds, niche)) continue;
    if (candidateInView(c, "open")) candidates++;
    else if (c.lifecycle === "dismissed") dismissedCandidates++;
  }
  for (const pv of previewsInView(model, "open")) if (nicheMatches(model, [pv.nicheId], niche)) candidates++;
  return { prospects, candidates, dismissedProspects, dismissedCandidates };
}

/**
 * Niches the Feed can show: an unfinished draft has no Niche Profile yet, so it has no Fit threshold
 * and nothing Surfaced.
 */
export function readyNiches(model: FeedModel): Niche[] {
  return model.state.niches.filter((n) => n.setupComplete);
}

/** The first Niche whose setup is not finished, to continue it from an empty Feed. */
export function unfinishedNiche(model: FeedModel): Niche | null {
  return model.state.niches.find((n) => !n.setupComplete) ?? null;
}

/** Ready Niches with at least one item (open or dismissed) in the tab: the Niche filter and the legend. */
export function nichesWithItems(model: FeedModel, tab: FeedTab): Niche[] {
  const ids = new Set<string>();
  if (tab === "prospects") {
    for (const p of model.state.prospects) {
      if (prospectInView(p, "open") || prospectInView(p, "dismissed")) for (const id of p.nicheIds) ids.add(id);
    }
  } else {
    for (const c of model.state.candidates) {
      if (candidateInView(c, "open") || candidateInView(c, "dismissed")) for (const id of c.nicheIds) ids.add(id);
    }
    for (const pv of previewsInView(model, "open")) ids.add(pv.nicheId);
  }
  return readyNiches(model).filter((n) => ids.has(n.id));
}

/** The Niches of `from` (ready Niches by default) in scope of the filter. */
export function nichesInScope(model: FeedModel, niche: NicheFilter, from: Niche[] = readyNiches(model)): Niche[] {
  return from.filter((n) => {
    if (niche === "all") return true;
    if (niche === "mine") return n.ownerId === model.me?.id;
    return n.id === niche;
  });
}

/** Niches whose latest agent run stopped early (for example because Credits ran out), with the reason. */
export function stoppedLastRuns(model: FeedModel, niches: Niche[]): { niche: Niche; reason: string }[] {
  const out: { niche: Niche; reason: string }[] = [];
  for (const n of niches) {
    let latest: AgentRun | null = null;
    // Runs are appended in order, so on the same day the later entry is the latest run.
    for (const r of model.state.agentRuns) if (r.nicheId === n.id && (!latest || compareIsoDates(r.on, latest.on) >= 0)) latest = r;
    if (latest?.stoppedReason) out.push({ niche: n, reason: latest.stoppedReason });
  }
  return out;
}

/** A Niche's name, or "Untitled Niche" while it has none (as on /niches). */
export function nicheName(n: Niche): string {
  return n.name.trim() || "Untitled Niche";
}

/* ------------------------------------------------------------------ */
/* People helpers                                                      */
/* ------------------------------------------------------------------ */

export type ClaimInfo =
  | { kind: "none" }
  | { kind: "mine"; campaignName: string | null; claim: Claim }
  | { kind: "other"; recruiterName: string; claim: Claim };

export function claimInfo(model: FeedModel, claim: Claim | null): ClaimInfo {
  if (!claim) return { kind: "none" };
  if (claim.recruiterId === model.me?.id) {
    return { kind: "mine", campaignName: model.campaignById.get(claim.campaignId)?.name ?? null, claim };
  }
  return { kind: "other", recruiterName: model.recruiterById.get(claim.recruiterId)?.name ?? "another Recruiter", claim };
}

/** True while an open Data Request concerns the Candidate: a legal hold, nothing is deleted. */
export function onRetentionHold(model: FeedModel, c: Candidate): boolean {
  return openDataRequestFor(model.state, { kind: "candidate", id: c.id }) !== null;
}

export interface RetentionInfo {
  tone: "neutral" | "warning" | "danger" | "success";
  long: string;
}

/** The retention sentence of a detail view; the tones follow core's RetentionBadge. */
export function retentionInfo(c: Candidate, today: ISODate, onHold: boolean): RetentionInfo | null {
  if (c.consent === "talent_pool" && c.retainUntil) {
    return { tone: "success", long: `In the Talent Pool until ${formatDate(c.retainUntil)}` };
  }
  if (c.consent === "this_opportunity" && c.retainUntil) {
    return { tone: "success", long: `Consented for this opportunity only, kept until ${formatDate(c.retainUntil)}` };
  }
  if (onHold) {
    return { tone: "neutral", long: "On hold: an open Data Request concerns this Candidate, so nothing is deleted until it is answered" };
  }
  if (c.deleteOn) {
    const days = Math.max(0, daysUntil(c.deleteOn, today));
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    const tone = days <= 2 ? "danger" : days <= 7 ? "warning" : "neutral";
    return { tone, long: `Deleted ${when} unless contacted (${RETENTION.surfacedCandidateDays}-day retention rule)` };
  }
  if (c.retainUntil) {
    const days = Math.max(0, daysUntil(c.retainUntil, today));
    const tone = days <= 2 ? "danger" : days <= 7 ? "warning" : "neutral";
    return { tone, long: `Kept until ${formatDate(c.retainUntil)}: ${RETENTION.contactedNoConsentDays} days after the first email without Consent, even if they reply` };
  }
  return null;
}

export function hasEmail(person: HiringContact | Candidate, kind: PersonKind): boolean {
  const wanted = emailKindFor(kind);
  return person.contactValues.some((v) => v.kind === wanted && v.verification !== "invalid");
}

export function hasMobile(person: HiringContact | Candidate): boolean {
  return person.contactValues.some((v) => v.kind === "mobile" && v.verification !== "invalid");
}

/** Maximum Credits for one person: the email when missing, the mobile only when ticked and missing. */
export function enrichEstimate(person: HiringContact | Candidate, kind: PersonKind, mobile: boolean): number {
  return (hasEmail(person, kind) ? 0 : PRICES.verifiedEmail) + (mobile && !hasMobile(person) ? PRICES.mobile : 0);
}

export function getPerson(model: FeedModel, ref: PersonRef): HiringContact | Candidate | undefined {
  return ref.kind === "candidate"
    ? model.state.candidates.find((c) => c.id === ref.id)
    : model.state.hiringContacts.find((h) => h.id === ref.id);
}

/** Why a person cannot be enriched right now, or null. */
export function enrichBlocker(model: FeedModel, person: HiringContact | Candidate, kind: PersonKind): string | null {
  const claim = claimInfo(model, person.claim);
  if (claim.kind === "other") return `Claimed by ${claim.recruiterName}`;
  if (person.lifecycle === "dismissed") return "Dismissed";
  if (person.lifecycle === "suppressed") return "On the Suppression List";
  if (hasEmail(person, kind) && hasMobile(person)) return "Already Enriched";
  return null;
}

/** The best Hiring Contact to enrich first: lowest rank, not claimed by someone else, without an email. */
export function topEnrichableContact(model: FeedModel, prospectId: string): HiringContact | null {
  const list = model.contactsByProspect.get(prospectId) ?? [];
  return list.find((h) => !h.proposed && !hasEmail(h, "hiring_contact") && enrichBlocker(model, h, "hiring_contact") === null) ?? null;
}

export function feedRef(row: FeedRow): FeedItemRef | null {
  if (row.kind === "preview") return null;
  return { kind: row.kind, id: row.id };
}

export function nicheShortName(n: Niche | undefined): string {
  if (!n) return "Unknown Niche";
  return nicheName(n).split(" - ")[0];
}

export function personHref(kind: "prospect" | PersonKind, id: string, prospectId?: string): string {
  if (kind === "prospect") return `/prospects/${id}`;
  if (kind === "candidate") return `/candidates/${id}`;
  return `/prospects/${prospectId ?? ""}`;
}

/** Most recent Signal (the one flagged by `hasNewSignal`). */
export function newestSignalId(p: Prospect): string | null {
  if (!p.hasNewSignal || p.signals.length === 0) return null;
  return [...p.signals].sort((a, b) => compareIsoDates(b.date, a.date))[0].id;
}

/** Campaigns a set of people can join: same audience, sharing a Niche, not paused. */
export function campaignsFor(model: FeedModel, kind: PersonKind, nicheIds: string[]): Campaign[] {
  const audience = kind === "candidate" ? "candidates" : "hiring_contacts";
  return model.state.campaigns
    .filter((c) => c.audience === audience)
    .sort((a, b) => Number(nicheIds.includes(b.nicheId)) - Number(nicheIds.includes(a.nicheId)) || compareText(a.name, b.name));
}

export function personNicheIds(model: FeedModel, ref: PersonRef): string[] {
  const p = getPerson(model, ref);
  if (!p) return [];
  if (ref.kind === "candidate") return (p as Candidate).nicheIds;
  return model.prospectById.get((p as HiringContact).prospectId)?.nicheIds ?? [];
}
